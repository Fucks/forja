import { eventItems, matchesEventTrigger } from "@/server/triggers/event_trigger_listener.js";
import type { EventTrigger } from "@/server/triggers/event_trigger_listener.js";
import type { EventEnvelope, ForjaEvent, RunStatusName } from "@/shared/events.js";
import type { ItemSelection } from "@/shared/trigger_types.js";
import { buildRunStartedEvent } from "@/test/factories/forja_event_factory.js";

const PROJECT_ID = "prj_forja";
const OTHER_PROJECT_ID = "prj_loja";
const FLOW_ID = "flw_entrega";
const OTHER_FLOW_ID = "flw_revisao";
const WORK_ITEM_ID = "itm_issue1";

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
