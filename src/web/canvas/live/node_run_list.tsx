import { clsx } from "clsx";
import type { JSX } from "react";

import { formatDuration, formatUsd } from "@/lib/format.js";
import type { SerializedNodeRun } from "@/shared/run_types.js";
import { describeNodeRun } from "@/web/canvas/live/node_run_sorting.js";
import type { UsageByNodeRun } from "@/web/canvas/live/use_node_run_usage.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";

const NO_VALUE = "—";

export function NodeRunList({
    nodeRuns,
    usageByNodeRun,
    selectedNodeRunId,
    onSelect,
}: {
    nodeRuns: SerializedNodeRun[];
    usageByNodeRun: UsageByNodeRun;
    selectedNodeRunId?: string;
    onSelect: (nodeRunId: string) => void;
}): JSX.Element {
    if (nodeRuns.length === 0) {
        return <p className="text-sm text-muted">Este nó ainda não executou nesta run.</p>;
    }

    return (
        <ul aria-label="Execuções do nó" className="flex flex-col gap-0.5">
            {nodeRuns.map((nodeRun) => (
                <li key={nodeRun.id}>
                    <NodeRunRow
                        nodeRun={nodeRun}
                        costUsd={usageByNodeRun.get(nodeRun.id)?.costUsd}
                        isSelected={nodeRun.id === selectedNodeRunId}
                        onSelect={() => onSelect(nodeRun.id)}
                    />
                </li>
            ))}
        </ul>
    );
}

function NodeRunRow({
    nodeRun,
    costUsd,
    isSelected,
    onSelect,
}: {
    nodeRun: SerializedNodeRun;
    costUsd?: number;
    isSelected: boolean;
    onSelect: () => void;
}): JSX.Element {
    return (
        <button
            type="button"
            aria-pressed={isSelected}
            onClick={onSelect}
            className={clsx(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-surface-raised",
                isSelected && "bg-surface-raised",
            )}
        >
            <StatusBadge status={nodeRun.status} size="sm" showLabel={false} />
            <span className="min-w-0 flex-1 truncate">{describeNodeRun(nodeRun)}</span>
            <span className="font-mono text-muted">{formatNodeRunDuration(nodeRun)}</span>
            <span className="w-16 text-right font-mono text-muted">
                {formatNodeRunCost(costUsd)}
            </span>
        </button>
    );
}

export function formatNodeRunCost(costUsd: number | undefined): string {
    return costUsd === undefined ? NO_VALUE : formatUsd(costUsd);
}

// The live events do not carry the times, so a NodeRun they created shows its duration on reload.
export function formatNodeRunDuration({
    startedAt,
    finishedAt,
}: Pick<SerializedNodeRun, "startedAt" | "finishedAt">): string {
    if (startedAt === undefined || finishedAt === undefined) {
        return NO_VALUE;
    }

    const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    return formatDuration(Math.max(0, durationMs));
}
