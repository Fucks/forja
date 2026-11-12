import type { JSX } from "react";

import { formatCalendarDay, formatTokens, formatUsd } from "@/lib/format.js";
import type { UsageGroupBy } from "@/shared/usage_types.js";
import type { UsageRow } from "@/web/app/usage/use_usage.js";
import { USAGE_GROUP_LABELS } from "@/web/app/usage/usage_group_labels.js";

type UsageTotals = Omit<UsageRow, "key" | "label">;

const NO_USAGE: UsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
    nodeRuns: 0,
};

export function UsageTable({
    rows,
    groupBy,
    onSelectNode,
}: {
    rows: UsageRow[];
    groupBy: UsageGroupBy;
    onSelectNode: (nodeId: string) => void;
}): JSX.Element {
    const groupLabel = USAGE_GROUP_LABELS[groupBy];

    return (
        <table
            aria-label={`Uso por ${groupLabel.toLowerCase()}`}
            className="w-full border-collapse text-left"
        >
            <thead className="border-b border-border text-muted">
                <tr>
                    <th className="py-2 pr-4 font-medium">{groupLabel}</th>
                    <th className="py-2 pr-4 text-right font-medium">Entrada</th>
                    <th className="py-2 pr-4 text-right font-medium">Saída</th>
                    <th className="py-2 pr-4 text-right font-medium">Cache</th>
                    <th className="py-2 pr-4 text-right font-medium">Custo</th>
                    <th className="py-2 text-right font-medium">Execuções</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.key} className="border-b border-border">
                        <td className="py-1.5 pr-4">
                            <GroupLabel row={row} groupBy={groupBy} onSelectNode={onSelectNode} />
                        </td>
                        <UsageTotalsCells totals={row} />
                    </tr>
                ))}
            </tbody>
            <tfoot className="font-medium">
                <tr>
                    <td className="py-1.5 pr-4">Total</td>
                    <UsageTotalsCells totals={sumUsageRows(rows)} />
                </tr>
            </tfoot>
        </table>
    );
}

function GroupLabel({
    row,
    groupBy,
    onSelectNode,
}: {
    row: UsageRow;
    groupBy: UsageGroupBy;
    onSelectNode: (nodeId: string) => void;
}): JSX.Element {
    if (groupBy === "day") {
        return <>{formatCalendarDay(row.key)}</>;
    }
    if (groupBy !== "node") {
        return <>{row.label}</>;
    }

    return (
        <button
            type="button"
            title="Filtrar por este nó"
            onClick={() => onSelectNode(row.key)}
            className="text-steel hover:underline focus-visible:outline-accent"
        >
            {row.label}
        </button>
    );
}

function UsageTotalsCells({ totals }: { totals: UsageTotals }): JSX.Element {
    return (
        <>
            <td className="py-1.5 pr-4 text-right font-mono">{formatTokens(totals.inputTokens)}</td>
            <td className="py-1.5 pr-4 text-right font-mono">
                {formatTokens(totals.outputTokens)}
            </td>
            <td className="py-1.5 pr-4 text-right font-mono">
                {formatTokens(totals.cacheReadTokens)}
            </td>
            <td className="py-1.5 pr-4 text-right font-mono">{formatUsd(totals.costUsd)}</td>
            <td className="py-1.5 text-right font-mono">{totals.nodeRuns}</td>
        </>
    );
}

function sumUsageRows(rows: UsageRow[]): UsageTotals {
    return rows.reduce(
        (total, row) => ({
            inputTokens: total.inputTokens + row.inputTokens,
            outputTokens: total.outputTokens + row.outputTokens,
            cacheReadTokens: total.cacheReadTokens + row.cacheReadTokens,
            costUsd: total.costUsd + row.costUsd,
            nodeRuns: total.nodeRuns + row.nodeRuns,
        }),
        NO_USAGE,
    );
}
