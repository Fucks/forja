import type { JSX } from "react";
import { Link } from "react-router";

import { formatDateTime } from "@/lib/format.js";
import type { RunListItem } from "@/shared/run_types.js";
import { describeRunFlow } from "@/web/app/runs/describe_run_flow.js";
import { useRuns } from "@/web/app/runs/use_runs.js";
import type { RunFilters } from "@/web/app/runs/use_runs.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";
import { runPath, runsPath } from "@/web/config/navigation.js";

const RECENT_RUNS_LIMIT = 5;
const ALL_RUNS: RunFilters = {};
const CARD_TITLE_ID = "recent-runs-title";

export function RecentRunsCard({ projectId }: { projectId: string }): JSX.Element {
    return (
        <section
            aria-labelledby={CARD_TITLE_ID}
            className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
        >
            <header className="flex items-center justify-between gap-2">
                <h2 id={CARD_TITLE_ID} className="font-medium">
                    Últimas runs
                </h2>
                <Link to={runsPath(projectId)} className="text-steel hover:underline">
                    Ver todas
                </Link>
            </header>
            <RecentRunsContent projectId={projectId} />
        </section>
    );
}

function RecentRunsContent({ projectId }: { projectId: string }): JSX.Element {
    const runsQuery = useRuns(projectId, ALL_RUNS);

    if (runsQuery.isPending) {
        return <Skeleton className="h-16" />;
    }
    if (runsQuery.isError) {
        return <p className="text-muted">Não foi possível carregar as runs.</p>;
    }
    if (runsQuery.data.length === 0) {
        return <p className="text-muted">Nenhuma run ainda.</p>;
    }

    return (
        <ul className="flex flex-col gap-1">
            {runsQuery.data.slice(0, RECENT_RUNS_LIMIT).map((run) => (
                <RecentRun key={run.id} projectId={projectId} run={run} />
            ))}
        </ul>
    );
}

function RecentRun({ projectId, run }: { projectId: string; run: RunListItem }): JSX.Element {
    return (
        <li className="flex items-center gap-3">
            <StatusBadge status={run.status} size="sm" />
            <Link to={runPath(projectId, run.id)} className="hover:underline">
                {describeRunFlow(run)}
            </Link>
            <span className="ml-auto text-xs text-muted">
                {formatDateTime(new Date(run.createdAt))}
            </span>
        </li>
    );
}
