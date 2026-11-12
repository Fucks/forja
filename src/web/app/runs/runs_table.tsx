import type { JSX, MouseEvent } from "react";
import { Link, useNavigate } from "react-router";

import { formatDateTime, formatDuration, formatUsd } from "@/lib/format.js";
import type { RunListItem } from "@/shared/run_types.js";
import { describeRunFlow } from "@/web/app/runs/describe_run_flow.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";
import { runPath } from "@/web/config/navigation.js";

const NOT_AVAILABLE = "—";
const MANUAL_TRIGGER_LABEL = "Manual";

export function RunsTable({
    projectId,
    runs,
}: {
    projectId: string;
    runs: RunListItem[];
}): JSX.Element {
    return (
        <table aria-label="Runs" className="w-full border-collapse text-left">
            <thead className="border-b border-border text-muted">
                <tr>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 pr-4 font-medium">Fluxo</th>
                    <th className="py-2 pr-4 font-medium">Itens</th>
                    <th className="py-2 pr-4 font-medium">Início</th>
                    <th className="py-2 pr-4 font-medium">Duração</th>
                    <th className="py-2 pr-4 font-medium">Custo</th>
                    <th className="py-2 font-medium">Gatilho</th>
                </tr>
            </thead>
            <tbody>
                {runs.map((run) => (
                    <RunRow key={run.id} projectId={projectId} run={run} />
                ))}
            </tbody>
        </table>
    );
}

// The whole row opens the run; the flow link is what keyboard users reach.
function RunRow({ projectId, run }: { projectId: string; run: RunListItem }): JSX.Element {
    const navigate = useNavigate();
    const openRunPath = runPath(projectId, run.id);

    return (
        <tr
            onClick={() => void navigate(openRunPath)}
            className="cursor-pointer border-b border-border hover:bg-surface-raised"
        >
            <td className="py-1.5 pr-4">
                <StatusBadge status={run.status} size="sm" />
            </td>
            <td className="py-1.5 pr-4">
                <Link
                    to={openRunPath}
                    onClick={keepClickOffTheRow}
                    className="hover:underline focus-visible:outline-accent"
                >
                    {describeRunFlow(run)}
                </Link>
            </td>
            <td className="py-1.5 pr-4">{describeItems(run)}</td>
            <td className="py-1.5 pr-4">{formatWhenPresent(run.startedAt, formatIsoDateTime)}</td>
            <td className="py-1.5 pr-4 font-mono">
                {formatWhenPresent(run.durationMs, formatDuration)}
            </td>
            <td className="py-1.5 pr-4 font-mono">{formatWhenPresent(run.costUsd, formatUsd)}</td>
            <td className="py-1.5">{run.triggerName ?? MANUAL_TRIGGER_LABEL}</td>
        </tr>
    );
}

// The link already opens the run; letting the click reach the row would open it twice.
function keepClickOffTheRow(event: MouseEvent): void {
    event.stopPropagation();
}

function describeItems(run: RunListItem): string {
    if (run.itemCount === 0) {
        return NOT_AVAILABLE;
    }

    const succeededItemCount = run.itemCount - run.failedItemCount;
    return `${succeededItemCount} ok · ${run.failedItemCount} com falha`;
}

function formatIsoDateTime(isoDate: string): string {
    return formatDateTime(new Date(isoDate));
}

function formatWhenPresent<T>(value: T | undefined, format: (present: T) => string): string {
    return value === undefined ? NOT_AVAILABLE : format(value);
}
