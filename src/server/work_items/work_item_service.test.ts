import type { DatabaseHandle } from "@/server/db/client.js";
import { ConflictError, DomainValidationError, NotFoundError } from "@/server/errors.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import { createWorkItemService } from "@/server/work_items/work_item_service.js";
import type { WorkItemService } from "@/server/work_items/work_item_service.js";
import type { LocalItemInput, WorkItem } from "@/shared/work_item_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import {
    buildGithubIssue,
    buildLocalItemInput,
    buildWorkItem,
} from "@/test/factories/work_item_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";

const CREATED_AT = new Date("2026-05-04T09:00:00Z");
const ONE_MINUTE_MS = 60_000;
const PROJECT_ID = "prj_forja";
const OTHER_PROJECT_ID = "prj_loja";
const LOCAL_BRANCH_PATTERN = /^forja\/item-[0-9a-z]{8}$/;

describe("WorkItemService", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let events: EventBus;
    let repo: WorkItemRepository;
    let service: WorkItemService;

    beforeEach(() => {
        database = createTestDb();
        const projects = new ProjectRepository(database.db);
        projects.insert(buildProject({ id: PROJECT_ID }));
        projects.insert(buildProject({ id: OTHER_PROJECT_ID }));
        clock = new FakeClock(CREATED_AT);
        events = createEventBus(clock);
        repo = new WorkItemRepository(database.db);
        service = createWorkItemService({
            repo,
            events,
            clock,
        });
    });

    afterEach(() => {
        database.close();
    });

    function publishedEvents(): unknown[] {
        return events.since(0).map((envelope) => envelope.event);
    }

    describe("createLocal", () => {
        it("creates an open local item with defaults and a forja/item- branch", async () => {
            const item = await createItem({ title: "Login" });

            expect(item).toEqual({
                id: expect.stringMatching(/^itm_/) as unknown,
                projectId: PROJECT_ID,
                source: "local",
                title: "Login",
                body: "",
                labels: [],
                state: "open",
                blockedBy: [],
                branch: expect.stringMatching(LOCAL_BRANCH_PATTERN) as unknown,
                archived: false,
                createdAt: CREATED_AT.toISOString(),
                updatedAt: CREATED_AT.toISOString(),
            });
        });

        it("gives each item its own branch, even when created in the same instant", async () => {
            const first = await createItem({ title: "A" });
            const second = await createItem({ title: "B" });

            expect(first.branch).not.toBe(second.branch);
        });

        it("publishes work_item.created", async () => {
            const item = await createItem({ title: "Login" });

            expect(publishedEvents()).toEqual([
                { type: "work_item.created", projectId: PROJECT_ID, workItemId: item.id },
            ]);
        });

        it("rejects an unknown project", async () => {
            const creation = service.createLocal("prj_nenhum", buildLocalItemInput({ title: "A" }));

            await expect(creation).rejects.toThrow(NotFoundError);
        });

        it("accepts blockers from the same project", async () => {
            const blocker = await createItem({ title: "A" });

            const item = await createItem({ blockedBy: [blocker.id] });

            expect(item.blockedBy).toEqual([blocker.id]);
        });

        it("rejects blockers that do not exist or belong to another project", async () => {
            const foreign = await service.createLocal(OTHER_PROJECT_ID, buildLocalItemInput());

            const creation = createItem({ blockedBy: [foreign.id, "itm_nenhum"] });

            await expect(creation).rejects.toThrow(DomainValidationError);
        });
    });

    describe("get", () => {
        it("returns the stored item", async () => {
            const created = await createItem({ body: "Descrição", labels: ["frontend"] });

            const item = await service.get(created.id);

            expect(item).toEqual(created);
        });

        it("rejects an unknown id", async () => {
            await expect(service.get("itm_nenhum")).rejects.toThrow(NotFoundError);
        });
    });

    describe("updateLocal", () => {
        it("changes only the fields sent and keeps the branch", async () => {
            const created = await createItem({ body: "Antes", labels: ["frontend"] });
            clock.advance(ONE_MINUTE_MS);

            const updated = await service.updateLocal(created.id, { title: "Novo título" });

            expect(updated).toEqual({
                ...created,
                title: "Novo título",
                updatedAt: minutesAfterCreation(1),
            });
            await expect(service.get(created.id)).resolves.toEqual(updated);
        });

        it("closes the item", async () => {
            const created = await createItem();

            const updated = await service.updateLocal(created.id, { state: "closed" });

            expect(updated.state).toBe("closed");
        });

        it("publishes work_item.updated", async () => {
            const created = await createItem();

            await service.updateLocal(created.id, { body: "Depois" });

            expect(publishedEvents()).toContainEqual({
                type: "work_item.updated",
                projectId: PROJECT_ID,
                workItemId: created.id,
            });
        });

        it("refuses to edit a GitHub item", async () => {
            const githubItem = buildWorkItem({ projectId: PROJECT_ID });
            repo.insert(githubItem);

            const update = service.updateLocal(githubItem.id, { title: "Outro" });

            await expect(update).rejects.toThrow(ConflictError);
        });

        it("rejects an item blocked by itself", async () => {
            const created = await createItem();

            const update = service.updateLocal(created.id, { blockedBy: [created.id] });

            await expect(update).rejects.toThrow(DomainValidationError);
        });

        it("rejects an unknown id", async () => {
            const update = service.updateLocal("itm_nenhum", { title: "Outro" });

            await expect(update).rejects.toThrow(NotFoundError);
        });
    });

    describe("setManualColumn", () => {
        it("places any item in a manual column and publishes work_item.updated", async () => {
            const githubItem = buildWorkItem({ projectId: PROJECT_ID });
            repo.insert(githubItem);

            const updated = await service.setManualColumn(githubItem.id, "needs_human");

            expect(updated.manualColumn).toBe("needs_human");
            await expect(service.get(githubItem.id)).resolves.toEqual(updated);
            expect(publishedEvents()).toEqual([
                { type: "work_item.updated", projectId: PROJECT_ID, workItemId: githubItem.id },
            ]);
        });

        it("clears the manual column with null", async () => {
            const created = await createItem();
            await service.setManualColumn(created.id, "done");

            const cleared = await service.setManualColumn(created.id, null);

            expect(cleared.manualColumn).toBeUndefined();
            await expect(service.get(created.id)).resolves.toEqual(cleared);
        });
    });

    describe("archive", () => {
        it("archives a local item", async () => {
            const created = await createItem();

            const archived = await service.archive(created.id);

            expect(archived.archived).toBe(true);
            await expect(service.get(created.id)).resolves.toEqual(archived);
        });

        it("refuses to archive a GitHub item", async () => {
            const githubItem = buildWorkItem({ projectId: PROJECT_ID });
            repo.insert(githubItem);

            await expect(service.archive(githubItem.id)).rejects.toThrow(ConflictError);
        });
    });

    describe("list", () => {
        it("lists the project's items in creation order, without archived ones", async () => {
            const first = await createItem({ title: "Primeiro" });
            clock.advance(ONE_MINUTE_MS);
            const second = await createItem({ title: "Segundo" });
            const archived = await createItem({ title: "Arquivado" });
            await service.archive(archived.id);
            await service.createLocal(OTHER_PROJECT_ID, buildLocalItemInput());

            const items = await service.list(PROJECT_ID);

            expect(items.map((item) => item.id)).toEqual([first.id, second.id]);
        });

        it("includes archived items when asked", async () => {
            const archived = await createItem();
            await service.archive(archived.id);

            const items = await service.list(PROJECT_ID, { includeArchived: true });

            expect(items.map((item) => item.id)).toEqual([archived.id]);
        });

        it("filters by state", async () => {
            await createItem({ title: "Aberto" });
            const closed = await createItem({ title: "Fechado" });
            await service.updateLocal(closed.id, { state: "closed" });

            const items = await service.list(PROJECT_ID, { state: "closed" });

            expect(items.map((item) => item.id)).toEqual([closed.id]);
        });

        it("filters by label", async () => {
            const frontend = await createItem({ labels: ["frontend", "bug"] });
            await createItem({ labels: ["backend"] });

            const items = await service.list(PROJECT_ID, { label: "frontend" });

            expect(items.map((item) => item.id)).toEqual([frontend.id]);
        });

        it("rejects an unknown project", async () => {
            await expect(service.list("prj_nenhum")).rejects.toThrow(NotFoundError);
        });
    });

    describe("isBlocked", () => {
        it("is true while any blocker is still open", async () => {
            const openBlocker = await createItem({ title: "Aberto" });
            const closedBlocker = await createItem({ title: "Fechado" });
            await service.updateLocal(closedBlocker.id, { state: "closed" });
            const item = await createItem({ blockedBy: [openBlocker.id, closedBlocker.id] });

            const isBlocked = service.isBlocked(item, await itemsById());

            expect(isBlocked).toBe(true);
        });

        it("is false once every blocker is closed", async () => {
            const blocker = await createItem({ title: "Bloqueador" });
            const item = await createItem({ blockedBy: [blocker.id] });
            await service.updateLocal(blocker.id, { state: "closed" });

            const isBlocked = service.isBlocked(item, await itemsById());

            expect(isBlocked).toBe(false);
        });

        it("is false without blockers", async () => {
            const item = await createItem();

            expect(service.isBlocked(item, await itemsById())).toBe(false);
        });

        it("ignores blockers missing from the map", async () => {
            const blocker = await createItem({ title: "Bloqueador" });
            const item = await createItem({ blockedBy: [blocker.id] });

            expect(service.isBlocked(item, new Map())).toBe(false);
        });
    });

    describe("snapshots", () => {
        it("returns the snapshots in the requested order", async () => {
            const first = await createItem({ title: "Primeiro", labels: ["frontend"] });
            const second = await createItem({ title: "Segundo", body: "Corpo" });

            const snapshots = await service.snapshots(PROJECT_ID, [second.id, first.id]);

            expect(snapshots).toEqual([
                {
                    id: second.id,
                    title: "Segundo",
                    body: "Corpo",
                    labels: [],
                    branch: second.branch,
                },
                {
                    id: first.id,
                    title: "Primeiro",
                    body: "",
                    labels: ["frontend"],
                    branch: first.branch,
                },
            ]);
        });

        it("includes the number and url of GitHub items", async () => {
            const githubItem = buildWorkItem({ projectId: PROJECT_ID });
            repo.insert(githubItem);

            const [snapshot] = await service.snapshots(PROJECT_ID, [githubItem.id]);

            expect(snapshot).toMatchObject({
                number: 7,
                url: githubItem.url,
                branch: "forja/issue-7",
            });
        });

        it("rejects an item of another project", async () => {
            const foreign = await service.createLocal(OTHER_PROJECT_ID, buildLocalItemInput());

            const snapshots = service.snapshots(PROJECT_ID, [foreign.id]);

            await expect(snapshots).rejects.toThrow(NotFoundError);
        });
    });

    describe("upsertFromGithub", () => {
        it("creates one item per issue on a forja/issue-<number> branch", async () => {
            const issue = buildGithubIssue({ number: 12, title: "Checkout", labels: ["loja"] });

            const counts = await service.upsertFromGithub(PROJECT_ID, [issue]);

            const [item] = await service.list(PROJECT_ID);
            expect(counts).toEqual({ created: 1, updated: 0 });
            expect(item).toEqual({
                id: expect.stringMatching(/^itm_/) as unknown,
                projectId: PROJECT_ID,
                source: "github",
                number: 12,
                url: issue.url,
                title: "Checkout",
                body: "",
                labels: ["loja"],
                state: "open",
                blockedBy: [],
                branch: "forja/issue-12",
                archived: false,
                createdAt: CREATED_AT.toISOString(),
                updatedAt: CREATED_AT.toISOString(),
                syncedAt: CREATED_AT.toISOString(),
            });
        });

        it("resolves dependencies between issues of the same batch", async () => {
            const blocked = buildGithubIssue({ number: 1, blockedByNumbers: [2] });
            const blocker = buildGithubIssue({ number: 2 });

            await service.upsertFromGithub(PROJECT_ID, [blocked, blocker]);

            const blockerItem = await findItemByNumber(2);
            await expect(findItemByNumber(1)).resolves.toMatchObject({
                blockedBy: [blockerItem.id],
            });
        });

        it("resolves dependencies on issues synced earlier and drops unknown numbers", async () => {
            await service.upsertFromGithub(PROJECT_ID, [buildGithubIssue({ number: 2 })]);

            await service.upsertFromGithub(PROJECT_ID, [
                buildGithubIssue({ number: 1, blockedByNumbers: [2, 99] }),
            ]);

            const blocker = await findItemByNumber(2);
            await expect(findItemByNumber(1)).resolves.toMatchObject({ blockedBy: [blocker.id] });
        });

        it("does not duplicate nor touch items when the same data is synced twice", async () => {
            const issues = [
                buildGithubIssue({ number: 1, blockedByNumbers: [2] }),
                buildGithubIssue({ number: 2 }),
            ];
            await service.upsertFromGithub(PROJECT_ID, issues);
            const firstSync = await service.list(PROJECT_ID);
            clock.advance(ONE_MINUTE_MS);

            const counts = await service.upsertFromGithub(PROJECT_ID, issues);

            const secondSync = await service.list(PROJECT_ID);
            expect(counts).toEqual({ created: 0, updated: 0 });
            expect(secondSync).toEqual(
                firstSync.map((item) => ({ ...item, syncedAt: minutesAfterCreation(1) })),
            );
        });

        it("updates the issues that changed and keeps the Forja-only fields", async () => {
            await service.upsertFromGithub(PROJECT_ID, [buildGithubIssue({ number: 1 })]);
            const synced = await findItemByNumber(1);
            await service.setManualColumn(synced.id, "needs_human");
            clock.advance(ONE_MINUTE_MS);

            const counts = await service.upsertFromGithub(PROJECT_ID, [
                buildGithubIssue({ number: 1, title: "Renomeada", state: "closed" }),
            ]);

            expect(counts).toEqual({ created: 0, updated: 1 });
            await expect(service.get(synced.id)).resolves.toMatchObject({
                title: "Renomeada",
                state: "closed",
                branch: "forja/issue-1",
                manualColumn: "needs_human",
                updatedAt: minutesAfterCreation(1),
            });
        });

        it("publishes work_item.created and work_item.updated only for what changed", async () => {
            await service.upsertFromGithub(PROJECT_ID, [buildGithubIssue({ number: 1 })]);
            const synced = await findItemByNumber(1);

            await service.upsertFromGithub(PROJECT_ID, [
                buildGithubIssue({ number: 1, title: "Renomeada" }),
                buildGithubIssue({ number: 2 }),
            ]);

            const created = await findItemByNumber(2);
            expect(publishedEvents()).toEqual([
                { type: "work_item.created", projectId: PROJECT_ID, workItemId: synced.id },
                { type: "work_item.created", projectId: PROJECT_ID, workItemId: created.id },
                { type: "work_item.updated", projectId: PROJECT_ID, workItemId: synced.id },
            ]);
        });

        it("rejects an unknown project", async () => {
            const upsert = service.upsertFromGithub("prj_nenhum", [buildGithubIssue()]);

            await expect(upsert).rejects.toThrow(NotFoundError);
        });
    });

    async function findItemByNumber(number: number): Promise<WorkItem> {
        const items = await service.list(PROJECT_ID);
        const item = items.find((candidate) => candidate.number === number);
        if (!item) {
            throw new Error(`No work item for issue #${number}`);
        }

        return item;
    }

    async function itemsById(): Promise<Map<string, WorkItem>> {
        const items = await service.list(PROJECT_ID);
        return new Map(items.map((item) => [item.id, item]));
    }

    function createItem(overrides: Partial<LocalItemInput> = {}): Promise<WorkItem> {
        return service.createLocal(PROJECT_ID, buildLocalItemInput(overrides));
    }

    function minutesAfterCreation(minutes: number): string {
        return new Date(CREATED_AT.getTime() + minutes * ONE_MINUTE_MS).toISOString();
    }
});
