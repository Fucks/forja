import type { EventEnvelope, ForjaEvent } from "@/shared/events.js";
import type { Trigger, TriggerConfig } from "@/shared/trigger_types.js";

type EventTriggerConfig = Extract<TriggerConfig, { kind: "event" }>;
type RunLifecycleEvent = Extract<
    ForjaEvent,
    { type: "run.created" | "run.started" | "run.finished" }
>;

export type EventTrigger = Trigger & { config: EventTriggerConfig };

export function matchesEventTrigger(trigger: EventTrigger, envelope: EventEnvelope): boolean {
    const { event } = envelope;
    if (event.type !== trigger.config.event || event.projectId !== trigger.projectId) {
        return false;
    }
    if (event.type !== "run.finished") {
        return true;
    }

    return passesRunFilter(trigger.config.filter, event);
}

export function eventItems(trigger: Trigger, envelope: EventEnvelope): string[] | undefined {
    const { event } = envelope;
    if (trigger.itemSelection !== "event_items" || event.type !== "work_item.created") {
        return undefined;
    }

    return [event.workItemId];
}

function passesRunFilter(filter: EventTriggerConfig["filter"], event: RunLifecycleEvent): boolean {
    const isOfFilteredFlow = filter?.flowId === undefined || filter.flowId === event.flowId;
    const hasFilteredStatus = filter?.status === undefined || filter.status === event.status;

    return isOfFilteredFlow && hasFilteredStatus;
}
