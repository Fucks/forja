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
import { buildLocalItemInput, buildWorkItem } from "@/test/factories/work_item_factory.js";
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

    function createItem(overrides: Partial<LocalItemInput> = {}): Promise<WorkItem> {
        return service.createLocal(PROJECT_ID, buildLocalItemInput(overrides));
    }

    function minutesAfterCreation(minutes: number): string {
        return new Date(CREATED_AT.getTime() + minutes * ONE_MINUTE_MS).toISOString();
    }
});
