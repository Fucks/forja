import type { RunListItem } from "@/shared/run_types.js";

export function buildRunListItem(overrides: Partial<RunListItem> = {}): RunListItem {
    return {
        id: "run_1",
        flowId: "flw_entrega",
        flowName: "Entrega",
        flowVersion: 2,
        status: "SUCCEEDED",
        itemCount: 2,
        failedItemCount: 0,
        createdAt: "2026-11-11T22:00:00.000Z",
        startedAt: "2026-11-11T22:00:01.000Z",
        finishedAt: "2026-11-11T22:30:01.000Z",
        durationMs: 1_800_000,
        costUsd: 1.25,
        ...overrides,
    };
}
