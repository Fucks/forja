import type { DatabaseHandle } from "@/server/db/client.js";
import { FlowRepository } from "@/server/flows/flow_repository.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import {
    createEventTriggerListener,
    eventItems,
    matchesEventTrigger,
} from "@/server/triggers/event_trigger_listener.js";
import type { EventTrigger } from "@/server/triggers/event_trigger_listener.js";
import { TriggerRepository } from "@/server/triggers/trigger_repository.js";
import { createTriggerService } from "@/server/triggers/trigger_service.js";
import type { TriggerInput, TriggerService } from "@/server/triggers/trigger_service.js";
import type { EventEnvelope, ForjaEvent, RunStatusName } from "@/shared/events.js";
import type { ItemSelection, Trigger, TriggerFire } from "@/shared/trigger_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildRunStartedEvent } from "@/test/factories/forja_event_factory.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildTriggerInput } from "@/test/factories/trigger_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeRunStarter } from "@/test/fakes/fake_run_starter.js";
import { createTestDb } from "@/test/test_db.js";

const PROJECT_ID = "prj_forja";
const OTHER_PROJECT_ID = "prj_loja";
const FLOW_ID = "flw_entrega";
const OTHER_FLOW_ID = "flw_revisao";
const WORK_ITEM_ID = "itm_issue1";
const NOW = new Date("2026-11-09T10:00:00Z");
const MAX_CHAIN_DEPTH = 3;

describe("matchesEventTrigger", () => {
    it("matches usage.limit_reset of the same project", () => {
        const trigger = buildEventTrigger({ event: "usage.limit_reset" });

        const matches = matchesEventTrigger(trigger, envelopeOf(limitReset(PROJECT_ID)));

        expect(matches).toBe(true);
    });

    it("ignores an event of another project", () => {
        const trigger = buildEventTrigger({ event: "usage.limit_reset" });

        const matches = matchesEventTrigger(trigger, envelopeOf(limitReset(OTHER_PROJECT_ID)));

        expect(matches).toBe(false);
    });

    it("ignores an event of another type", () => {
        const trigger = buildEventTrigger({ event: "usage.limit_reset" });

        const matches = matchesEventTrigger(trigger, envelopeOf(workItemCreated()));

        expect(matches).toBe(false);
    });

    it("matches work_item.created of the same project", () => {
        const trigger = buildEventTrigger({ event: "work_item.created" });

        const matches = matchesEventTrigger(trigger, envelopeOf(workItemCreated()));

        expect(matches).toBe(true);
    });

    describe("run.finished", () => {
        it("matches any finished run of the project without a filter", () => {
            const trigger = buildEventTrigger({ event: "run.finished" });

            const matches = matchesEventTrigger(trigger, envelopeOf(runFinished()));

            expect(matches).toBe(true);
        });

        it("ignores a run with another status than the filter", () => {
            const trigger = buildEventTrigger({
                event: "run.finished",
                filter: { status: "SUCCEEDED" },
            });

            const matches = matchesEventTrigger(
                trigger,
                envelopeOf(runFinished({ status: "FAILED" })),
            );

            expect(matches).toBe(false);
        });

        it("matches a run with the status of the filter", () => {
            const trigger = buildEventTrigger({
                event: "run.finished",
                filter: { status: "SUCCEEDED" },
            });

            const matches = matchesEventTrigger(
                trigger,
                envelopeOf(runFinished({ status: "SUCCEEDED" })),
            );

            expect(matches).toBe(true);
        });

        it("ignores a run of another flow than the filter", () => {
            const trigger = buildEventTrigger({
                event: "run.finished",
                filter: { flowId: OTHER_FLOW_ID },
            });

            const matches = matchesEventTrigger(trigger, envelopeOf(runFinished()));

            expect(matches).toBe(false);
        });

        it("ignores a finished run of another project", () => {
            const trigger = buildEventTrigger({ event: "run.finished" });

            const matches = matchesEventTrigger(
                trigger,
                envelopeOf(runFinished({ projectId: OTHER_PROJECT_ID })),
            );

            expect(matches).toBe(false);
        });
    });
});

describe("eventItems", () => {
    it("gives the created item when the trigger runs with the items of the event", () => {
        const trigger = buildEventTrigger({ event: "work_item.created" });

        const items = eventItems(trigger, envelopeOf(workItemCreated()));

        expect(items).toEqual([WORK_ITEM_ID]);
    });

    it("gives no items when the source node of the flow selects them", () => {
        const trigger = buildEventTrigger({ event: "work_item.created" }, "source");

        const items = eventItems(trigger, envelopeOf(workItemCreated()));

        expect(items).toBeUndefined();
    });

    it("gives no items for an event without an item", () => {
        const trigger = buildEventTrigger({ event: "usage.limit_reset" });

        const items = eventItems(trigger, envelopeOf(limitReset(PROJECT_ID)));

        expect(items).toBeUndefined();
    });
});

describe("createEventTriggerListener", () => {
    let database: DatabaseHandle;
    let events: EventBus;
    let executor: FakeRunStarter;
    let triggers: TriggerService;
    let listener: { start(): void; stop(): void };

    beforeEach(() => {
        database = createTestDb();
        insertProjectWithFlows(database);
        const clock = new FakeClock(NOW);
        events = createEventBus(clock);
        executor = new FakeRunStarter(events, clock);
        triggers = createTriggerService({
            repo: new TriggerRepository(database.db),
            executor,
            runs: executor.runs,
            events,
            clock,
            cronRunner: { reschedule: () => Promise.resolve() },
        });
        listener = createEventTriggerListener({
            events,
            triggers,
            maxChainDepth: MAX_CHAIN_DEPTH,
        });
        listener.start();
    });

    afterEach(() => {
        listener.stop();
        database.close();
    });

    function createTrigger(overrides: Partial<TriggerInput>): Promise<Trigger> {
        return triggers.create(
            buildTriggerInput({ projectId: PROJECT_ID, flowId: FLOW_ID, ...overrides }),
        );
    }

    async function latestFireOf(trigger: Trigger): Promise<TriggerFire | undefined> {
        const [latest] = await triggers.history(trigger.id, 1);
        return latest;
    }

    async function finishRunsUntilNoneIsActive(): Promise<void> {
        let activeRuns = await executor.runs.listActiveRuns();
        while (activeRuns.length > 0) {
            for (const run of activeRuns) {
                await executor.finishRun(run.id);
            }
            await settlePendingWork();
            activeRuns = await executor.runs.listActiveRuns();
        }
    }

    it("starts the flow when the usage limit of the same project resets", async () => {
        await createTrigger({ config: { kind: "event", event: "usage.limit_reset" } });

        events.publish(limitReset(PROJECT_ID));
        await settlePendingWork();

        expect(executor.startedRuns).toEqual([
            expect.objectContaining({ projectId: PROJECT_ID, flowId: FLOW_ID }),
        ]);
    });

    it("starts nothing when the usage limit of another project resets", async () => {
        await createTrigger({ config: { kind: "event", event: "usage.limit_reset" } });

        events.publish(limitReset(OTHER_PROJECT_ID));
        await settlePendingWork();

        expect(executor.startedRuns).toEqual([]);
    });

    it("does not start the flow for a failed run when the filter asks for SUCCEEDED", async () => {
        await createTrigger({
            config: { kind: "event", event: "run.finished", filter: { status: "SUCCEEDED" } },
        });

        events.publish(runFinished({ status: "FAILED" }));
        await settlePendingWork();

        expect(executor.startedRuns).toEqual([]);
    });

    it("starts the run with only the created item", async () => {
        await createTrigger({
            itemSelection: "event_items",
            config: { kind: "event", event: "work_item.created" },
        });

        events.publish(workItemCreated());
        await settlePendingWork();

        expect(executor.startedRuns).toEqual([
            expect.objectContaining({ itemIds: [WORK_ITEM_ID] }),
        ]);
    });

    it("stops a chain of flows that start each other at depth 3", async () => {
        await createTrigger({
            flowId: OTHER_FLOW_ID,
            config: { kind: "event", event: "run.finished", filter: { flowId: FLOW_ID } },
        });
        const backToFirstFlow = await createTrigger({
            flowId: FLOW_ID,
            config: { kind: "event", event: "run.finished", filter: { flowId: OTHER_FLOW_ID } },
        });
        await executor.startRun({ projectId: PROJECT_ID, flowId: FLOW_ID, itemIds: [] });

        await finishRunsUntilNoneIsActive();

        const startedFlowIds = executor.startedRuns.map((run) => run.flowId);
        expect(startedFlowIds).toEqual([FLOW_ID, OTHER_FLOW_ID, FLOW_ID, OTHER_FLOW_ID]);
        expect(await latestFireOf(backToFirstFlow)).toEqual(
            expect.objectContaining({
                outcome: "skipped",
                message: "cadeia de gatilhos muito longa",
            }),
        );
    });

    it("ignores triggers that are not of events", async () => {
        await createTrigger({ config: { kind: "manual" } });

        events.publish(limitReset(PROJECT_ID));
        await settlePendingWork();

        expect(executor.startedRuns).toEqual([]);
    });

    it("starts nothing once stopped", async () => {
        await createTrigger({ config: { kind: "event", event: "usage.limit_reset" } });
        listener.stop();

        events.publish(limitReset(PROJECT_ID));
        await settlePendingWork();

        expect(executor.startedRuns).toEqual([]);
    });
});

function buildEventTrigger(
    config: Omit<EventTrigger["config"], "kind">,
    itemSelection: ItemSelection = "event_items",
): EventTrigger {
    return {
        id: "trg_evento",
        projectId: PROJECT_ID,
        flowId: FLOW_ID,
        name: "Por evento",
        enabled: true,
        policy: "skip",
        itemSelection,
        config: { kind: "event", ...config },
        createdAt: "2026-11-09T10:00:00.000Z",
    };
}

function envelopeOf(event: ForjaEvent): EventEnvelope {
    return { id: 1, at: "2026-11-09T10:00:00.000Z", event };
}

function limitReset(projectId: string): ForjaEvent {
    return { type: "usage.limit_reset", projectId };
}

function workItemCreated(): ForjaEvent {
    return { type: "work_item.created", projectId: PROJECT_ID, workItemId: WORK_ITEM_ID };
}

function runFinished(overrides: { projectId?: string; status?: RunStatusName } = {}): ForjaEvent {
    return buildRunStartedEvent({
        type: "run.finished",
        projectId: PROJECT_ID,
        flowId: FLOW_ID,
        status: "SUCCEEDED",
        ...overrides,
    });
}

function insertProjectWithFlows(database: DatabaseHandle): void {
    new ProjectRepository(database.db).insert(buildProject({ id: PROJECT_ID }));

    const flows = new FlowRepository(database.db);
    for (const flowId of [FLOW_ID, OTHER_FLOW_ID]) {
        flows.insert({
            id: flowId,
            projectId: PROJECT_ID,
            name: flowId,
            graph: buildCanonicalFlow(),
            createdAt: NOW.toISOString(),
        });
    }
}

// Lets the fires started by the listener run before the test looks at the result.
function settlePendingWork(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}
