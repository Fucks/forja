import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";
import { useParams } from "react-router";

import type { SerializedRunView } from "@/shared/run_types.js";
import { PageTitle } from "@/web/app/page_title.js";
import { RunCanvas } from "@/web/canvas/live/run_canvas.js";
import { RunControlBar } from "@/web/canvas/live/run_control_bar.js";
import { RunItemSelect } from "@/web/canvas/live/run_item_select.js";
import { listRunItems } from "@/web/canvas/live/run_view_model.js";
import { useLiveRun } from "@/web/canvas/live/use_live_run.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

export function RunPage(): JSX.Element {
    const { runId = "" } = useParams();
    const liveRun = useLiveRun(runId);

    return (
        <div className="flex h-full flex-col gap-4">
            <PageTitle>Run</PageTitle>
            <RunPageContent view={liveRun.view} error={liveRun.error} />
        </div>
    );
}

function RunPageContent({ view, error }: { view?: SerializedRunView; error?: Error }): JSX.Element {
    if (error) {
        return (
            <EmptyState
                icon={TriangleAlert}
                title="Não foi possível abrir a run"
                description={error.message}
            />
        );
    }
    if (!view) {
        return <Skeleton className="min-h-0 flex-1" />;
    }

    return <LiveRunScreen view={view} />;
}

function LiveRunScreen({ view }: { view: SerializedRunView }): JSX.Element {
    const [filterItemId, setFilterItemId] = useState<string>();

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
            <RunControlBar view={view}>
                <RunItemSelect
                    itemIds={listRunItems(view)}
                    filterItemId={filterItemId}
                    onFilterChange={setFilterItemId}
                />
            </RunControlBar>
            <div className="min-h-0 flex-1">
                <RunCanvas view={view} filterItemId={filterItemId} />
            </div>
        </div>
    );
}
