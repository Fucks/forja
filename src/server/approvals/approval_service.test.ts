import { ApprovalRepository } from "@/server/approvals/approval_repository.js";
import {
    type ApprovalService,
    createApprovalService,
} from "@/server/approvals/approval_service.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ConflictError, NotFoundError } from "@/server/errors.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import type { NewApproval } from "@/shared/approval_types.js";
import type { ForjaEvent } from "@/shared/events.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildRunRecord } from "@/test/factories/run_record_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";

const NOW = new Date("2026-11-10T10:00:00Z");
const ONE_MINUTE_MS = 60_000;
const PROJECT_ID = "prj_forja";
const OTHER_PROJECT_ID = "prj_loja";
const RUN_ID = "run_entrega";
const OTHER_RUN_ID = "run_loja";

describe("ApprovalService", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let publishedEvents: ForjaEvent[];
    let service: ApprovalService;

    beforeEach(async () => {
        database = createTestDb();
        await insertProjectsAndRuns(database);
        clock = new FakeClock(NOW);
        const events = createEventBus(clock);
        publishedEvents = [];
        events.subscribe((envelope) => publishedEvents.push(envelope.event));
        service = createApprovalService({
            repo: new ApprovalRepository(database.db),
            events,
            clock,
        });
    });

    afterEach(() => {
        database.close();
    });

    describe("create", () => {
        it("stores a pending approval that can be read back", async () => {
            const created = await service.create(buildNewApproval({ diff: "+ linha nova" }));
            const found = await service.get(created.id);

            expect(created).toMatchObject({
                projectId: PROJECT_ID,
                runId: RUN_ID,
                nodeRunId: "nrn_gate",
                message: "Revise o diff",
                show: ["diff", "logs"],
                diff: "+ linha nova",
                status: "pending",
                createdAt: NOW.toISOString(),
            });
            expect(created.id).toMatch(/^apv_/);
            expect(found).toEqual(created);
        });

        it("publishes approval.requested", async () => {
            const created = await service.create(buildNewApproval());

            expect(publishedEvents).toContainEqual({
                type: "approval.requested",
                projectId: PROJECT_ID,
                approvalId: created.id,
                runId: RUN_ID,
            });
        });
    });

    describe("get", () => {
        it("rejects an approval that does not exist", async () => {
            await expect(service.get("apv_missing")).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe("listPending", () => {
        it("lists only the pending approvals of the project, oldest first", async () => {
            const first = await service.create(buildNewApproval({ nodeRunId: "nrn_1" }));
            clock.advance(ONE_MINUTE_MS);
            const second = await service.create(buildNewApproval({ nodeRunId: "nrn_2" }));
            const resolved = await service.create(buildNewApproval({ nodeRunId: "nrn_3" }));
            await service.resolve(resolved.id, "approved");
            await service.create(
                buildNewApproval({ projectId: OTHER_PROJECT_ID, runId: OTHER_RUN_ID }),
            );

            const pending = await service.listPending(PROJECT_ID);

            expect(pending.map((approval) => approval.id)).toEqual([first.id, second.id]);
        });
    });

    describe("resolve", () => {
        it("records the decision, the comment and when it was resolved", async () => {
            const created = await service.create(buildNewApproval());
            clock.advance(ONE_MINUTE_MS);

            const resolved = await service.resolve(created.id, "rejected", "Faltam testes");

            expect(resolved).toMatchObject({
                status: "rejected",
                comment: "Faltam testes",
                resolvedAt: new Date(NOW.getTime() + ONE_MINUTE_MS).toISOString(),
            });
            expect(await service.get(created.id)).toEqual(resolved);
        });

        it("publishes approval.resolved", async () => {
            const created = await service.create(buildNewApproval());

            await service.resolve(created.id, "approved");

            expect(publishedEvents).toContainEqual({
                type: "approval.resolved",
                projectId: PROJECT_ID,
                approvalId: created.id,
                runId: RUN_ID,
            });
        });

        it("refuses to resolve an approval twice", async () => {
            const created = await service.create(buildNewApproval());
            await service.resolve(created.id, "approved");

            const resolvingAgain = service.resolve(created.id, "rejected");

            await expect(resolvingAgain).rejects.toBeInstanceOf(ConflictError);
            expect((await service.get(created.id)).status).toBe("approved");
        });

        it("rejects an approval that does not exist", async () => {
            const resolving = service.resolve("apv_missing", "approved");

            await expect(resolving).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe("expireOfNodeRun", () => {
        it("expires the pending approval of the NodeRun, which can no longer be resolved", async () => {
            const created = await service.create(buildNewApproval());

            await service.expireOfNodeRun("nrn_gate");

            expect(await service.get(created.id)).toMatchObject({
                status: "expired",
                resolvedAt: NOW.toISOString(),
            });
            await expect(service.resolve(created.id, "approved")).rejects.toBeInstanceOf(
                ConflictError,
            );
        });

        it("leaves an approval that was already resolved as it was", async () => {
            const created = await service.create(buildNewApproval());
            await service.resolve(created.id, "approved");

            await service.expireOfNodeRun("nrn_gate");

            expect((await service.get(created.id)).status).toBe("approved");
        });
    });
});

function buildNewApproval(overrides: Partial<NewApproval> = {}): NewApproval {
    return {
        projectId: PROJECT_ID,
        runId: RUN_ID,
        nodeRunId: "nrn_gate",
        workItemId: "itm_issue1",
        message: "Revise o diff",
        show: ["diff", "logs"],
        ...overrides,
    };
}

async function insertProjectsAndRuns(database: DatabaseHandle): Promise<void> {
    const projects = new ProjectRepository(database.db);
    projects.insert(buildProject({ id: PROJECT_ID }));
    projects.insert(buildProject({ id: OTHER_PROJECT_ID }));

    const runs = new SqliteRunRepository(database.db, new FakeClock(NOW));
    await runs.createRun(buildRunRecord({ id: RUN_ID, projectId: PROJECT_ID }));
    await runs.createRun(buildRunRecord({ id: OTHER_RUN_ID, projectId: OTHER_PROJECT_ID }));
}
