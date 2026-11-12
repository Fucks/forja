import { ScrollText } from "lucide-react";
import type { JSX } from "react";
import { Link } from "react-router";

import { formatUsd } from "@/lib/format.js";
import type { ItemTimelineEntry } from "@/shared/board_types.js";
import { toApiUrl } from "@/web/api/api_client.js";
import { formatNodeRunDuration } from "@/web/canvas/live/node_run_list.js";
import { describeNodeRun } from "@/web/canvas/live/node_run_sorting.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";
import { nodeRunPath } from "@/web/config/navigation.js";

const LOGS_ICON_SIZE_PX = 14;
const NO_VALUE = "—";

export function ItemTimeline({
    projectId,
    entries,
}: {
    projectId: string;
    entries: ItemTimelineEntry[];
}): JSX.Element {
    if (entries.length === 0) {
        return <p className="text-sm text-muted">Nenhuma run trabalhou neste item ainda.</p>;
    }

    return (
        <ul aria-label="Linha do tempo" className="flex flex-col gap-1">
            {entries.map((entry) => (
                <li key={entry.nodeRunId} className="flex items-center gap-1">
                    <TimelineEntryLink projectId={projectId} entry={entry} />
                    <NodeRunLogsLink entry={entry} />
                </li>
            ))}
        </ul>
    );
}

function TimelineEntryLink({
    projectId,
    entry,
}: {
    projectId: string;
    entry: ItemTimelineEntry;
}): JSX.Element {
    const description = describeNodeRun(entry);

    return (
        <Link
            to={nodeRunPath(projectId, entry.runId, entry.nodeRunId)}
            aria-label={`${entry.nodeLabel} · ${description}`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1 text-xs hover:bg-surface-raised"
        >
            <StatusBadge status={entry.status} size="sm" showLabel={false} />
            <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{entry.nodeLabel}</span>
                <span className="text-muted"> · {description}</span>
            </span>
            <span className="font-mono text-muted">{formatNodeRunDuration(entry)}</span>
            <span className="w-16 text-right font-mono text-muted">
                {entry.costUsd === undefined ? NO_VALUE : formatUsd(entry.costUsd)}
            </span>
        </Link>
    );
}

function NodeRunLogsLink({ entry }: { entry: ItemTimelineEntry }): JSX.Element {
    return (
        <a
            href={toApiUrl(rawLogsPath(entry.nodeRunId))}
            target="_blank"
            rel="noreferrer"
            aria-label={`Logs de ${entry.nodeLabel}`}
            className="rounded-sm p-1 text-muted hover:bg-surface-raised"
        >
            <ScrollText size={LOGS_ICON_SIZE_PX} aria-hidden="true" />
        </a>
    );
}

function rawLogsPath(nodeRunId: string): string {
    return `/node-runs/${encodeURIComponent(nodeRunId)}/logs/raw`;
}
