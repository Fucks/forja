import type { DatabaseHandle } from "@/server/db/client.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import { FlowRepository } from "@/server/flows/flow_repository.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { TriggerRepository } from "@/server/triggers/trigger_repository.js";
import { startQueuedFiresWhenRunsFinish } from "@/server/triggers/trigger_firing.js";
import { createTriggerService } from "@/server/triggers/trigger_service.js";
import { verifyWebhookToken } from "@/server/triggers/webhook_tokens.js";
import type {
    TriggerInput,
    TriggerService,
    TriggerServiceDeps,
} from "@/server/triggers/trigger_service.js";
import type { ForjaEvent } from "@/shared/events.js";
import type { Trigger, TriggerConfig, TriggerWithToken } from "@/shared/trigger_types.js";
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
const ITEM_IDS = ["itm_issue1", "itm_issue2"];
const FIRE_REASON = "manual";
const ONE_MINUTE_MS = 60_000;
const NIGHTLY_CONFIG: TriggerConfig = {
    kind: "schedule",
    cron: "0 2 * * *",
    timezone: "America/Sao_Paulo",
};

describe("TriggerService", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let events: EventBus;
    let executor: FakeRunStarter;
    let rescheduledTriggerIds: string[];
    let deps: TriggerServiceDeps;
    let service: TriggerService;
    let stopQueueListener: (() => void) | undefined;

    beforeEach(() => {
        database = createTestDb();
        insertProjectsAndFlows(database);
        clock = new FakeClock(NOW);
        events = createEventBus(clock);
        executor = new FakeRunStarter(events, clock);
        rescheduledTriggerIds = [];
        deps = {
            repo: new TriggerRepository(database.db),
            executor,
            runs: executor.runs,
            events,
            clock,
            cronRunner: {
                reschedule: (triggerId) => {
                    rescheduledTriggerIds.push(triggerId);
                    return Promise.resolve();
                },
            },
        };
        service = createTriggerService(deps);
    });

    afterEach(() => {
        stopQueueListener?.();
        stopQueueListener = undefined;
        database.close();
    });

    function listenForFinishedRuns(): void {
        stopQueueListener = startQueuedFiresWhenRunsFinish(deps);
    }

    function fire(trigger: Trigger, itemIds?: string[]) {
        return service.fire(trigger.id, { itemIds, reason: FIRE_REASON });
    }

    function firedEvents(): ForjaEvent[] {
        return events
            .since(0)
            .map((envelope) => envelope.event)
            .filter((event) => event.type === "trigger.fired");
    }

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

    describe("schedule triggers", () => {
        it.each([
            ["the cron has not five fields", { cron: "0 22 * *" }],
            ["the cron has an invalid field", { cron: "0 25 * * *" }],
            ["the timezone is unknown", { timezone: "Marte/Base" }],
        ])("rejects the creation when %s", async (_case, schedule) => {
            const creating = createTrigger({ config: { ...NIGHTLY_CONFIG, ...schedule } });

            await expect(creating).rejects.toThrow(DomainValidationError);
            expect(await service.list(PROJECT_ID)).toEqual([]);
        });

        it("rejects an update to an invalid cron and keeps the trigger as it was", async () => {
            const trigger = await createTrigger({ config: NIGHTLY_CONFIG });

            const updating = service.update(trigger.id, {
                config: { ...NIGHTLY_CONFIG, cron: "61 * * * *" },
            });

            await expect(updating).rejects.toThrow(/61 \* \* \* \*/);
            expect(await service.list(PROJECT_ID)).toEqual([trigger]);
        });

        it("reschedules the cron runner on create, update and remove", async () => {
            const trigger = await createTrigger({ config: NIGHTLY_CONFIG });
            await service.update(trigger.id, { enabled: false });
            await service.remove(trigger.id);

            expect(rescheduledTriggerIds).toEqual([trigger.id, trigger.id, trigger.id]);
        });
    });

    describe("webhook triggers", () => {
        const WEBHOOK_INPUT_CONFIG = { kind: "webhook" } as const;

        async function createWebhookTrigger(): Promise<TriggerWithToken> {
            const created = await service.create(
                buildTriggerInput({
                    projectId: PROJECT_ID,
                    flowId: FLOW_ID,
                    config: WEBHOOK_INPUT_CONFIG,
                }),
            );
            if (!("token" in created)) {
                throw new Error("A webhook trigger is created with its token");
            }
            return created;
        }

        function tokenHashOf(trigger: Trigger | undefined): string {
            if (trigger?.config.kind !== "webhook") {
                throw new Error("Expected a webhook trigger");
            }
            return trigger.config.tokenHash;
        }

        it("gives the token on creation and keeps only its hash", async () => {
            const created = await createWebhookTrigger();

            const [listed] = await service.list(PROJECT_ID);

            expect(verifyWebhookToken(created.token, tokenHashOf(created))).toBe(true);
            expect(listed).not.toHaveProperty("token");
            expect(tokenHashOf(listed)).toBe(tokenHashOf(created));
        });

        it("keeps the token when an update sends the webhook config again", async () => {
            const created = await createWebhookTrigger();

            const updated = await service.update(created.id, {
                name: "Renomeado",
                config: WEBHOOK_INPUT_CONFIG,
            });

            expect(tokenHashOf(updated)).toBe(tokenHashOf(created));
        });

        it("rejects turning another kind of trigger into a webhook", async () => {
            const trigger = await createTrigger();

            const updating = service.update(trigger.id, { config: WEBHOOK_INPUT_CONFIG });

            await expect(updating).rejects.toThrow(DomainValidationError);
        });

        it("rotates the token, so only the new one is accepted", async () => {
            const created = await createWebhookTrigger();

            const rotated = await service.rotateWebhookToken(created.id);

            expect(verifyWebhookToken(rotated.token, tokenHashOf(rotated))).toBe(true);
            expect(verifyWebhookToken(created.token, tokenHashOf(rotated))).toBe(false);
        });

        it("rejects rotating the token of a trigger that is not a webhook", async () => {
            const trigger = await createTrigger();

            const rotating = service.rotateWebhookToken(trigger.id);

            await expect(rotating).rejects.toThrow(DomainValidationError);
        });
    });

    describe("list", () => {
        it("lists the triggers of the project in creation order", async () => {
            const manual = await createTrigger();
            const nightly = await createTrigger({ flowId: OTHER_FLOW_ID, config: NIGHTLY_CONFIG });

            expect(await service.list(PROJECT_ID)).toEqual([manual, nightly]);
            expect(await service.list(OTHER_PROJECT_ID)).toEqual([]);
        });

        it("keeps only the triggers of the requested kind", async () => {
            await createTrigger();
            const nightly = await createTrigger({ config: NIGHTLY_CONFIG });

            expect(await service.list(PROJECT_ID, { kind: "schedule" })).toEqual([nightly]);
        });

        it("rejects a project that does not exist", async () => {
            await expect(service.list("prj_ausente")).rejects.toThrow(NotFoundError);
        });
    });

    describe("fire of a manual trigger", () => {
        it("starts a run of the flow with the trigger id and the items of the fire", async () => {
            const trigger = await createTrigger();

            const fired = await fire(trigger, ITEM_IDS);

            expect(fired).toEqual({
                id: expect.stringMatching(/^trf_/) as unknown,
                triggerId: trigger.id,
                at: NOW.toISOString(),
                outcome: "started",
                runId: expect.stringMatching(/^run_/) as unknown,
            });
            expect(executor.startedRuns).toEqual([
                {
                    projectId: PROJECT_ID,
                    flowId: FLOW_ID,
                    itemIds: ITEM_IDS,
                    triggerId: trigger.id,
                },
            ]);
        });

        it("starts the run without items when the source node selects them", async () => {
            const trigger = await createTrigger({ itemSelection: "source" });

            await fire(trigger, ITEM_IDS);

            expect(executor.startedRuns).toEqual([expect.objectContaining({ itemIds: [] })]);
        });

        it("publishes trigger.fired with the run", async () => {
            const trigger = await createTrigger();

            const fired = await fire(trigger);

            expect(firedEvents()).toEqual([
                {
                    type: "trigger.fired",
                    projectId: PROJECT_ID,
                    triggerId: trigger.id,
                    runId: fired.runId,
                    skipped: false,
                },
            ]);
        });

        it("shows every fire in the history, newest first", async () => {
            const trigger = await createTrigger({ policy: "parallel" });
            const first = await fire(trigger);
            clock.advance(ONE_MINUTE_MS);
            const second = await fire(trigger);

            const history = await service.history(trigger.id, 10);

            expect(history).toEqual([second, first]);
            expect(await service.history(trigger.id, 1)).toEqual([second]);
        });

        it("remembers when the trigger last fired", async () => {
            const trigger = await createTrigger();

            const fired = await fire(trigger);

            expect(await service.list(PROJECT_ID)).toEqual([{ ...trigger, lastFiredAt: fired.at }]);
        });

        it("runs even when it is disabled or all triggers are paused", async () => {
            const trigger = await createTrigger({ enabled: false });
            await service.setAllPaused(true);

            const fired = await fire(trigger);

            expect(fired.outcome).toBe("started");
        });

        it("rejects a trigger that does not exist", async () => {
            const firing = service.fire("trg_ausente", { reason: FIRE_REASON });

            await expect(firing).rejects.toThrow(NotFoundError);
        });
    });

    describe("fire of a trigger that is not manual", () => {
        it("records skipped without starting a run when the trigger is disabled", async () => {
            const trigger = await createTrigger({ enabled: false, config: NIGHTLY_CONFIG });

            const fired = await fire(trigger);

            expect(fired).toEqual(
                expect.objectContaining({
                    outcome: "skipped",
                    message: "O gatilho está desativado.",
                }),
            );
            expect(executor.startedRuns).toEqual([]);
        });

        it("records skipped while all triggers are paused, and runs again once resumed", async () => {
            const trigger = await createTrigger({ config: NIGHTLY_CONFIG });
            await service.setAllPaused(true);
            const whilePaused = await fire(trigger);
            await service.setAllPaused(false);

            const afterResuming = await fire(trigger);

            expect(whilePaused).toEqual(
                expect.objectContaining({
                    outcome: "skipped",
                    message: "Os gatilhos estão pausados.",
                }),
            );
            expect(afterResuming.outcome).toBe("started");
        });

        it("publishes trigger.fired marked as skipped and keeps it in the history", async () => {
            const trigger = await createTrigger({ enabled: false, config: NIGHTLY_CONFIG });

            const fired = await fire(trigger);

            expect(firedEvents()).toEqual([
                expect.objectContaining({ triggerId: trigger.id, skipped: true }),
            ]);
            expect(await service.history(trigger.id, 10)).toEqual([fired]);
        });
    });

    describe("chain of event triggers", () => {
        const EVENT_CONFIG: TriggerConfig = { kind: "event", event: "run.finished" };
        const MAX_CHAIN_DEPTH = 3;

        it("records skipped without starting a run when the chain is deeper than the limit", async () => {
            const trigger = await createTrigger({ config: EVENT_CONFIG });

            const fired = await service.fire(trigger.id, {
                reason: FIRE_REASON,
                chain: { depth: MAX_CHAIN_DEPTH + 1, maxDepth: MAX_CHAIN_DEPTH },
            });

            expect(fired).toEqual(
                expect.objectContaining({
                    outcome: "skipped",
                    message: "cadeia de gatilhos muito longa",
                }),
            );
            expect(executor.startedRuns).toEqual([]);
        });

        it("remembers the chain depth of the run it started", async () => {
            const trigger = await createTrigger({ config: EVENT_CONFIG });

            const fired = await service.fire(trigger.id, {
                reason: FIRE_REASON,
                chain: { depth: MAX_CHAIN_DEPTH, maxDepth: MAX_CHAIN_DEPTH },
            });

            expect(fired.outcome).toBe("started");
            expect(await service.chainDepthOfRun(fired.runId ?? "")).toBe(MAX_CHAIN_DEPTH);
        });

        it("gives depth zero to a run that no chain started", async () => {
            const trigger = await createTrigger();

            const fired = await fire(trigger);

            expect(await service.chainDepthOfRun(fired.runId ?? "")).toBe(0);
        });
    });

    describe("policy with an active run of the same flow", () => {
        async function startActiveRunOf(flowId: string): Promise<string> {
            const run = await executor.startRun({ projectId: PROJECT_ID, flowId, itemIds: [] });
            return run.id;
        }

        it("records skipped and starts nothing with skip", async () => {
            const trigger = await createTrigger({ policy: "skip" });
            await startActiveRunOf(FLOW_ID);

            const fired = await fire(trigger);

            expect(fired).toEqual(
                expect.objectContaining({
                    outcome: "skipped",
                    message: "Já existe uma run ativa deste fluxo.",
                }),
            );
            expect(executor.startedRuns).toHaveLength(1);
        });

        it("starts another run with parallel", async () => {
            const trigger = await createTrigger({ policy: "parallel" });
            await startActiveRunOf(FLOW_ID);

            const fired = await fire(trigger);

            expect(fired.outcome).toBe("started");
            expect(executor.startedRuns).toHaveLength(2);
        });

        it("ignores the active runs of other flows", async () => {
            const trigger = await createTrigger({ policy: "skip" });
            await startActiveRunOf(OTHER_FLOW_ID);

            const fired = await fire(trigger);

            expect(fired.outcome).toBe("started");
        });

        it("records queued and starts nothing yet with queue", async () => {
            const trigger = await createTrigger({ policy: "queue" });
            await startActiveRunOf(FLOW_ID);

            const fired = await fire(trigger, ITEM_IDS);

            expect(fired).toEqual(expect.objectContaining({ outcome: "queued" }));
            expect(fired.runId).toBeUndefined();
            expect(executor.startedRuns).toHaveLength(1);
        });

        it("starts the queued fire with its items when the active run finishes", async () => {
            listenForFinishedRuns();
            const trigger = await createTrigger({ policy: "queue" });
            const activeRunId = await startActiveRunOf(FLOW_ID);
            const queued = await fire(trigger, ITEM_IDS);

            await executor.finishRun(activeRunId);
            await settlePendingWork();

            const [started] = await service.history(trigger.id, 10);
            expect(started).toEqual({
                ...queued,
                outcome: "started",
                runId: expect.stringMatching(/^run_/) as unknown,
            });
            expect(executor.startedRuns.at(-1)).toEqual({
                projectId: PROJECT_ID,
                flowId: FLOW_ID,
                itemIds: ITEM_IDS,
                triggerId: trigger.id,
            });
            expect(firedEvents().at(-1)).toEqual(
                expect.objectContaining({ triggerId: trigger.id, runId: started?.runId }),
            );
        });

        it("starts the queued fires one at a time, oldest first", async () => {
            listenForFinishedRuns();
            const trigger = await createTrigger({ policy: "queue" });
            const activeRunId = await startActiveRunOf(FLOW_ID);
            const first = await fire(trigger, ["itm_first"]);
            clock.advance(ONE_MINUTE_MS);
            const second = await fire(trigger, ["itm_second"]);

            await executor.finishRun(activeRunId);
            await settlePendingWork();

            const outcomeById = await outcomesById(trigger);
            expect(outcomeById.get(first.id)).toBe("started");
            expect(outcomeById.get(second.id)).toBe("queued");
            expect(executor.startedRuns.at(-1)?.itemIds).toEqual(["itm_first"]);
        });

        it("starts a fire queued before a restart when no run of the flow is active", async () => {
            const trigger = await createTrigger({ policy: "queue" });
            const activeRunId = await startActiveRunOf(FLOW_ID);
            const queued = await fire(trigger);
            await executor.finishRun(activeRunId);

            listenForFinishedRuns();
            await settlePendingWork();

            expect((await outcomesById(trigger)).get(queued.id)).toBe("started");
        });

        async function outcomesById(trigger: Trigger): Promise<Map<string, string>> {
            const history = await service.history(trigger.id, 10);
            return new Map(history.map((fired) => [fired.id, fired.outcome]));
        }
    });

    describe("fire when the run cannot start", () => {
        it("records error with the message of a domain error", async () => {
            const trigger = await createTrigger();
            executor.failNextStart(new DomainValidationError("O fluxo não tem versão publicada."));

            const fired = await fire(trigger);

            expect(fired).toEqual(
                expect.objectContaining({
                    outcome: "error",
                    message: "O fluxo não tem versão publicada.",
                }),
            );
            expect(await service.history(trigger.id, 10)).toEqual([fired]);
        });

        it("records error with a generic message and logs any other failure", async () => {
            const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
            const trigger = await createTrigger();
            executor.failNextStart(new Error("SQLITE_BUSY"));

            const fired = await fire(trigger);

            expect(fired.message).toBe("Não foi possível iniciar a run.");
            expect(logError).toHaveBeenCalled();
            logError.mockRestore();
        });

        it("passes the turn to the next queued fire when a queued fire fails to start", async () => {
            listenForFinishedRuns();
            const trigger = await createTrigger({ policy: "queue" });
            const activeRun = await executor.startRun({
                projectId: PROJECT_ID,
                flowId: FLOW_ID,
                itemIds: [],
            });
            await fire(trigger, ["itm_first"]);
            clock.advance(ONE_MINUTE_MS);
            await fire(trigger, ["itm_second"]);
            executor.failNextStart(new DomainValidationError("Item inválido."));

            await executor.finishRun(activeRun.id);
            await settlePendingWork();

            const outcomes = (await service.history(trigger.id, 10)).map((fired) => fired.outcome);
            expect(outcomes).toEqual(["started", "error"]);
            expect(executor.startedRuns.at(-1)?.itemIds).toEqual(["itm_second"]);
        });
    });

    describe("isAllPaused", () => {
        it("starts unpaused and follows setAllPaused", async () => {
            const before = await service.isAllPaused();
            await service.setAllPaused(true);

            expect(before).toBe(false);
            expect(await service.isAllPaused()).toBe(true);
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

// Lets the work started by the run.finished listener run before the test looks at the result.
function settlePendingWork(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}
