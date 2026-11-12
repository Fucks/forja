import { CircleAlert, History, Play } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";
import { useParams } from "react-router";

import { PageTitle } from "@/web/app/page_title.js";
import { NewRunDialog } from "@/web/app/runs/new_run_dialog.js";
import { ALL_RUNS_CHOICE, RunFiltersBar, toRunFilters } from "@/web/app/runs/run_filters_bar.js";
import { RunsTable } from "@/web/app/runs/runs_table.js";
import { useRuns } from "@/web/app/runs/use_runs.js";
import type { RunFilters } from "@/web/app/runs/use_runs.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

export function RunsPage(): JSX.Element {
    const { projectId = "" } = useParams();
    const [filterChoice, setFilterChoice] = useState(ALL_RUNS_CHOICE);
    const [isNewRunOpen, setIsNewRunOpen] = useState(false);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
                <PageTitle>Runs</PageTitle>
                <Button variant="primary" onClick={() => setIsNewRunOpen(true)}>
                    <Play aria-hidden className="size-3.5" />
                    Nova run
                </Button>
            </div>
            <RunFiltersBar projectId={projectId} choice={filterChoice} onChange={setFilterChoice} />
            <RunsContent projectId={projectId} filters={toRunFilters(filterChoice)} />
            <NewRunDialog
                projectId={projectId}
                open={isNewRunOpen}
                onClose={() => setIsNewRunOpen(false)}
            />
        </div>
    );
}

function RunsContent({
    projectId,
    filters,
}: {
    projectId: string;
    filters: RunFilters;
}): JSX.Element {
    const runsQuery = useRuns(projectId, filters);

    if (runsQuery.isPending) {
        return <Skeleton className="h-24" />;
    }
    if (runsQuery.isError) {
        return (
            <EmptyState
                icon={CircleAlert}
                title="Não foi possível carregar as runs"
                description={runsQuery.error.message}
            />
        );
    }
    if (runsQuery.data.length === 0) {
        return (
            <EmptyState
                icon={History}
                title="Nenhuma run ainda"
                description="Inicie uma run de um fluxo publicado para acompanhar a execução aqui."
            />
        );
    }

    return (
        <div className="flex flex-col items-start gap-3">
            <RunsTable projectId={projectId} runs={runsQuery.data} />
            {runsQuery.hasNextPage && (
                <Button
                    loading={runsQuery.isFetchingNextPage}
                    onClick={() => void runsQuery.fetchNextPage()}
                >
                    Carregar mais
                </Button>
            )}
        </div>
    );
}
