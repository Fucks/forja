import type { DatabaseHandle } from "@/server/db/client.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import { FlowRepository } from "@/server/flows/flow_repository.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { TriggerRepository } from "@/server/triggers/trigger_repository.js";
import { createTriggerService } from "@/server/triggers/trigger_service.js";
import type { TriggerInput, TriggerService } from "@/server/triggers/trigger_service.js";
import type { Trigger } from "@/shared/trigger_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildTriggerInput } from "@/test/factories/trigger_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeRunStarter } from "@/test/fakes/fake_run_starter.js";
import { createTestDb } from "@/test/test_db.js";

const NOW = new Date("2026-11-09T10:00:00Z");
const PROJECT_ID = "prj_forja";
const OTHER_PROJECT_ID = "prj_loja";
const FLOW_ID = "flw_entrega";
const OTHER_FLOW_ID = "flw_revisao";
const FLOW_OF_OTHER_PROJECT_ID = "flw_loja";

describe("TriggerService", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let events: EventBus;
    let executor: FakeRunStarter;
    let service: TriggerService;

    beforeEach(() => {
        database = createTestDb();
        insertProjectsAndFlows(database);
        clock = new FakeClock(NOW);
        events = createEventBus(clock);
        executor = new FakeRunStarter(events, clock);
        service = createTriggerService({
            repo: new TriggerRepository(database.db),
            executor,
            runs: executor.runs,
            events,
            clock,
        });
    });

    afterEach(() => {
        database.close();
    });

    function createTrigger(overrides: Partial<TriggerInput> = {}): Promise<Trigger> {
        return service.create(
            buildTriggerInput({ projectId: PROJECT_ID, flowId: FLOW_ID, ...overrides }),
        );
    }

    describe("create", () => {
        it("creates the trigger with an id and the creation time", async () => {
            const input = buildTriggerInput({ projectId: PROJECT_ID, flowId: FLOW_ID });

            const trigger = await service.create(input);

            expect(trigger).toEqual({
                ...input,
                id: expect.stringMatching(/^trg_/) as unknown,
                createdAt: NOW.toISOString(),
            });
        });

        it("rejects a project that does not exist", async () => {
            const creating = createTrigger({ projectId: "prj_ausente" });

            await expect(creating).rejects.toThrow(NotFoundError);
        });

        it("rejects a flow of another project", async () => {
            const creating = createTrigger({ flowId: FLOW_OF_OTHER_PROJECT_ID });

            await expect(creating).rejects.toThrow(DomainValidationError);
        });
    });

    describe("update", () => {
        it("changes only the fields of the patch", async () => {
            const trigger = await createTrigger();

            const updated = await service.update(trigger.id, { name: "Noturno", policy: "queue" });

            expect(updated).toEqual({ ...trigger, name: "Noturno", policy: "queue" });
            expect(await service.list(PROJECT_ID)).toEqual([updated]);
        });

        it("rejects a trigger that does not exist", async () => {
            const updating = service.update("trg_ausente", { enabled: false });

            await expect(updating).rejects.toThrow(NotFoundError);
        });
    });

    describe("remove", () => {
        it("removes the trigger from the list", async () => {
            const trigger = await createTrigger();

            await service.remove(trigger.id);

            expect(await service.list(PROJECT_ID)).toEqual([]);
        });

        it("rejects a trigger that does not exist", async () => {
            await expect(service.remove("trg_ausente")).rejects.toThrow(NotFoundError);
        });
    });

    describe("list", () => {
        it("lists the triggers of the project in creation order", async () => {
            const manual = await createTrigger();
            const nightly = await createTrigger({
                flowId: OTHER_FLOW_ID,
                config: { kind: "schedule", cron: "0 2 * * *", timezone: "America/Sao_Paulo" },
            });

            expect(await service.list(PROJECT_ID)).toEqual([manual, nightly]);
            expect(await service.list(OTHER_PROJECT_ID)).toEqual([]);
        });

        it("keeps only the triggers of the requested kind", async () => {
            await createTrigger();
            const nightly = await createTrigger({
                config: { kind: "schedule", cron: "0 2 * * *", timezone: "America/Sao_Paulo" },
            });

            expect(await service.list(PROJECT_ID, { kind: "schedule" })).toEqual([nightly]);
        });

        it("rejects a project that does not exist", async () => {
            await expect(service.list("prj_ausente")).rejects.toThrow(NotFoundError);
        });
    });
});

function insertProjectsAndFlows(database: DatabaseHandle): void {
    const projects = new ProjectRepository(database.db);
    projects.insert(buildProject({ id: PROJECT_ID }));
    projects.insert(buildProject({ id: OTHER_PROJECT_ID }));

    const flows = new FlowRepository(database.db);
    const flowsByProject = [
        { id: FLOW_ID, projectId: PROJECT_ID },
        { id: OTHER_FLOW_ID, projectId: PROJECT_ID },
        { id: FLOW_OF_OTHER_PROJECT_ID, projectId: OTHER_PROJECT_ID },
    ];
    for (const flow of flowsByProject) {
        flows.insert({
            ...flow,
            name: flow.id,
            graph: buildCanonicalFlow(),
            createdAt: NOW.toISOString(),
        });
    }
}
