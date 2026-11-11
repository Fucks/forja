import type { EventBus } from "@/server/runtime/event_bus.js";
import type { TriggerChain } from "@/server/triggers/trigger_firing.js";
import type { TriggerService } from "@/server/triggers/trigger_service.js";
import type { EventEnvelope, ForjaEvent, ForjaEventType } from "@/shared/events.js";
import { TRIGGER_EVENTS } from "@/shared/trigger_types.js";
import type { Trigger, TriggerConfig } from "@/shared/trigger_types.js";

const EVENT_FIRE_REASON = "event";

const FIRST_CHAIN_DEPTH = 1;
const TRIGGER_EVENT_TYPES: ReadonlySet<ForjaEventType> = new Set(TRIGGER_EVENTS);

type EventTriggerConfig = Extract<TriggerConfig, { kind: "event" }>;
type RunLifecycleEvent = Extract<
    ForjaEvent,
    { type: "run.created" | "run.started" | "run.finished" }
>;

export type EventTrigger = Trigger & { config: EventTriggerConfig };

export interface EventTriggerListenerDeps {
    events: EventBus;
    triggers: Pick<TriggerService, "list" | "fire" | "chainDepthOfRun">;
    maxChainDepth: number;
}

export interface EventTriggerListener {
    start(): void;
    stop(): void;
}

export function createEventTriggerListener(deps: EventTriggerListenerDeps): EventTriggerListener {
    let unsubscribe: (() => void) | undefined;

    return {
        start: () => {
            unsubscribe ??= deps.events.subscribe((envelope) => {
                fireTriggersOfEvent(deps, envelope).catch((error: unknown) => {
                    console.error(`Falha nos gatilhos do evento ${envelope.event.type}`, error);
                });
            });
        },
        stop: () => {
            unsubscribe?.();
            unsubscribe = undefined;
        },
    };
}

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

// Fires one after the other, so the concurrency policy of a flow sees the run started by the
// previous trigger.
async function fireTriggersOfEvent(
    deps: EventTriggerListenerDeps,
    envelope: EventEnvelope,
): Promise<void> {
    if (!TRIGGER_EVENT_TYPES.has(envelope.event.type)) {
        return;
    }

    const matchingTriggers = await findMatchingTriggers(deps.triggers, envelope);
    if (matchingTriggers.length === 0) {
        return;
    }

    const depth = await depthOfChainStartedBy(deps.triggers, envelope.event);
    const chain: TriggerChain = { depth, maxDepth: deps.maxChainDepth };
    for (const trigger of matchingTriggers) {
        await deps.triggers.fire(trigger.id, {
            reason: EVENT_FIRE_REASON,
            itemIds: eventItems(trigger, envelope),
            chain,
        });
    }
}

async function findMatchingTriggers(
    triggers: EventTriggerListenerDeps["triggers"],
    envelope: EventEnvelope,
): Promise<EventTrigger[]> {
    const projectTriggers = await triggers.list(envelope.event.projectId, { kind: "event" });

    return projectTriggers
        .filter(isEventTrigger)
        .filter((trigger) => matchesEventTrigger(trigger, envelope));
}

// A finished run started by an event trigger is one link of a chain; the run it starts is the next.
async function depthOfChainStartedBy(
    triggers: EventTriggerListenerDeps["triggers"],
    event: ForjaEvent,
): Promise<number> {
    if (event.type !== "run.finished") {
        return FIRST_CHAIN_DEPTH;
    }

    const depthOfFinishedRun = await triggers.chainDepthOfRun(event.runId);
    return depthOfFinishedRun + 1;
}

function isEventTrigger(trigger: Trigger): trigger is EventTrigger {
    return trigger.config.kind === "event";
}

function passesRunFilter(filter: EventTriggerConfig["filter"], event: RunLifecycleEvent): boolean {
    const isOfFilteredFlow = filter?.flowId === undefined || filter.flowId === event.flowId;
    const hasFilteredStatus = filter?.status === undefined || filter.status === event.status;

    return isOfFilteredFlow && hasFilteredStatus;
}
