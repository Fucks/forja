import { assertNever } from "@/lib/assert_never.js";
import type { RunStatusName } from "@/shared/events.js";
import type {
    ItemSelection,
    Trigger,
    TriggerConfig,
    TriggerConfigInput,
    TriggerEvent,
    TriggerKind,
    TriggerPolicy,
} from "@/shared/trigger_types.js";
import { CRON_PRESETS } from "@/web/app/triggers/cron_presets.js";
import type { CreateTriggerInput, UpdateTriggerInput } from "@/web/app/triggers/use_triggers.js";

export const ANY_FILTER = "any";

export type RunStatusFilter = RunStatusName | typeof ANY_FILTER;

export interface TriggerDraft {
    name: string;
    flowId: string;
    kind: TriggerKind;
    policy: TriggerPolicy;
    itemSelection: ItemSelection;
    cron: string;
    timezone: string;
    event: TriggerEvent;
    runFlowId: string;
    runStatus: RunStatusFilter;
    columnId: string;
}

export type DraftChange = (changes: Partial<TriggerDraft>) => void;

const DEFAULT_CRON = CRON_PRESETS[0]?.value ?? "";

export function createEmptyDraft(flowId: string, timezone: string): TriggerDraft {
    return {
        name: "",
        flowId,
        kind: "manual",
        policy: "skip",
        itemSelection: "source",
        cron: DEFAULT_CRON,
        timezone,
        event: "usage.limit_reset",
        runFlowId: ANY_FILTER,
        runStatus: ANY_FILTER,
        columnId: "",
    };
}

export function draftFromTrigger(trigger: Trigger, timezone: string): TriggerDraft {
    return {
        ...createEmptyDraft(trigger.flowId, timezone),
        name: trigger.name,
        kind: trigger.config.kind,
        policy: trigger.policy,
        itemSelection: trigger.itemSelection,
        ...draftFieldsOfConfig(trigger.config),
    };
}

export function buildCreateTriggerInput(draft: TriggerDraft): CreateTriggerInput {
    return {
        flowId: draft.flowId,
        name: draft.name,
        policy: draft.policy,
        itemSelection: draft.itemSelection,
        config: buildConfigInput(draft),
    };
}

// A webhook sends no config: the server keeps its token only when the config is left alone.
export function buildTriggerChanges(draft: TriggerDraft): UpdateTriggerInput {
    const changes = { name: draft.name, policy: draft.policy, itemSelection: draft.itemSelection };
    if (draft.kind === "webhook") {
        return changes;
    }

    return { ...changes, config: buildConfigInput(draft) };
}

function draftFieldsOfConfig(config: TriggerConfig): Partial<TriggerDraft> {
    switch (config.kind) {
        case "manual":
        case "webhook":
            return {};
        case "schedule":
            return { cron: config.cron, timezone: config.timezone };
        case "event":
            return {
                event: config.event,
                runFlowId: config.filter?.flowId ?? ANY_FILTER,
                runStatus: config.filter?.status ?? ANY_FILTER,
            };
        case "board_column":
            return { columnId: config.columnId };
        default:
            return assertNever(config);
    }
}

function buildConfigInput(draft: TriggerDraft): TriggerConfigInput {
    switch (draft.kind) {
        case "manual":
            return { kind: "manual" };
        case "webhook":
            return { kind: "webhook" };
        case "schedule":
            return { kind: "schedule", cron: draft.cron, timezone: draft.timezone };
        case "event":
            return buildEventConfig(draft);
        case "board_column":
            return { kind: "board_column", columnId: draft.columnId };
        default:
            return assertNever(draft.kind);
    }
}

function buildEventConfig(draft: TriggerDraft): TriggerConfigInput {
    if (draft.event !== "run.finished") {
        return { kind: "event", event: draft.event };
    }

    return { kind: "event", event: draft.event, filter: buildRunFilter(draft) };
}

function buildRunFilter(draft: TriggerDraft): { flowId?: string; status?: RunStatusName } {
    return {
        ...(draft.runFlowId !== ANY_FILTER && { flowId: draft.runFlowId }),
        ...(draft.runStatus !== ANY_FILTER && { status: draft.runStatus }),
    };
}
