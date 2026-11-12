import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";

import { RUN_TERMINAL } from "@/engine/run_state.js";
import type { EventEnvelope, ForjaEventType, RunStatusName } from "@/shared/events.js";
import type { RunListItem } from "@/shared/run_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { useEventStream } from "@/web/api/use_event_stream.js";

export interface RunFilters {
    flowId?: string;
    status?: RunStatusName[];
}

const RUNS_QUERY_KEY = "runs";
const RUNS_PAGE_SIZE = 50;
const FIRST_PAGE_CURSOR: string | undefined = undefined;

const RUN_LIFECYCLE_EVENTS: ReadonlySet<ForjaEventType> = new Set<ForjaEventType>([
    "run.created",
    "run.started",
    "run.paused",
    "run.resumed",
    "run.finished",
]);

/** Active runs first, then the newest first; more pages load through the `before` cursor. */
export function useRuns(
    projectId: string,
    filters: RunFilters,
): UseInfiniteQueryResult<RunListItem[], ApiError> {
    useReloadRunsOnRunEvents(projectId);

    return useInfiniteQuery({
        queryKey: [RUNS_QUERY_KEY, projectId, filters],
        queryFn: ({ pageParam }) =>
            apiClient.get<RunListItem[]>(runsPagePath(projectId, filters, pageParam)),
        initialPageParam: FIRST_PAGE_CURSOR,
        getNextPageParam: findNextPageCursor,
        select: listActiveRunsFirst,
    });
}

export function isActiveRun(run: RunListItem): boolean {
    return !RUN_TERMINAL.has(run.status);
}

function useReloadRunsOnRunEvents(projectId: string): void {
    const queryClient = useQueryClient();
    const reloadOnRunEvent = (envelope: EventEnvelope): void => {
        if (RUN_LIFECYCLE_EVENTS.has(envelope.event.type)) {
            void queryClient.invalidateQueries({ queryKey: [RUNS_QUERY_KEY, projectId] });
        }
    };

    useEventStream({ projectId }, reloadOnRunEvent);
}

// A page shorter than the page size is the last one.
function findNextPageCursor(page: RunListItem[]): string | undefined {
    if (page.length < RUNS_PAGE_SIZE) {
        return undefined;
    }

    return page.at(-1)?.id;
}

function listActiveRunsFirst(data: InfiniteData<RunListItem[]>): RunListItem[] {
    const runs = data.pages.flat();
    const activeRuns = runs.filter(isActiveRun);
    const finishedRuns = runs.filter((run) => !isActiveRun(run));

    return [...activeRuns, ...finishedRuns];
}

function runsPagePath(projectId: string, filters: RunFilters, before?: string): string {
    const query = new URLSearchParams({ limit: String(RUNS_PAGE_SIZE) });
    if (before !== undefined) {
        query.set("before", before);
    }
    if (filters.flowId !== undefined) {
        query.set("flowId", filters.flowId);
    }
    filters.status?.forEach((status) => query.append("status", status));

    return `${projectRunsPath(projectId)}?${query.toString()}`;
}

function projectRunsPath(projectId: string): string {
    return `/projects/${encodeURIComponent(projectId)}/runs`;
}
