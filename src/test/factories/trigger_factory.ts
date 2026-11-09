import type { TriggerInput } from "@/server/triggers/trigger_service.js";

export function buildTriggerInput(overrides: Partial<TriggerInput> = {}): TriggerInput {
    return {
        projectId: "prj_forja",
        flowId: "flw_entrega",
        name: "Disparo manual",
        enabled: true,
        policy: "skip",
        itemSelection: "event_items",
        config: { kind: "manual" },
        ...overrides,
    };
}
