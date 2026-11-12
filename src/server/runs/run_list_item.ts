import type { RunRecord } from "@/server/runs/run_repository.js";
import type { RunListItem } from "@/shared/run_types.js";

export interface RunListContext {
    flowName: string;
    costUsd: number;
    triggerName?: string;
}

export function toRunListItem(run: RunRecord, context: RunListContext): RunListItem {
    return {
        id: run.id,
        flowId: run.flowId,
        flowName: context.flowName,
        flowVersion: run.flowVersion,
        status: run.status,
        pauseReason: run.pauseReason,
        itemCount: run.itemIds.length,
        failedItemCount: run.failedItemIds.length,
        createdAt: run.createdAt.toISOString(),
        startedAt: run.startedAt?.toISOString(),
        finishedAt: run.finishedAt?.toISOString(),
        durationMs: measureDurationMs(run),
        costUsd: context.costUsd,
        triggerName: context.triggerName,
    };
}

function measureDurationMs(run: RunRecord): number | undefined {
    if (!run.startedAt || !run.finishedAt) {
        return undefined;
    }

    return run.finishedAt.getTime() - run.startedAt.getTime();
}
