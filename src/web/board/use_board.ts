import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type { BoardView, ItemTimeline } from "@/shared/board_types.js";
import type { EventEnvelope, ForjaEventType } from "@/shared/events.js";
import type { ManualColumn } from "@/shared/work_item_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { useEventStream } from "@/web/api/use_event_stream.js";
import type { CreateEventSource } from "@/web/api/use_event_stream.js";

const BOARD_QUERY_KEY = ["board"];
const TIMELINE_QUERY_KEY_PART = "timeline";

const BOARD_CHANGING_EVENTS: ReadonlySet<ForjaEventType> = new Set<ForjaEventType>([
    "node_run.updated",
    "run.finished",
    "work_item.created",
    "work_item.updated",
]);

export function useBoard(
    projectId: string,
    createEventSource?: CreateEventSource,
): UseQueryResult<BoardView, ApiError> {
    const queryClient = useQueryClient();
    const refetchWhenBoardChanges = (envelope: EventEnvelope): void => {
        if (BOARD_CHANGING_EVENTS.has(envelope.event.type)) {
            void queryClient.invalidateQueries({ queryKey: boardQueryKey(projectId) });
        }
    };
    useEventStream({ projectId }, refetchWhenBoardChanges, createEventSource);

    return useQuery({
        queryKey: boardQueryKey(projectId),
        queryFn: () => apiClient.get<BoardView>(boardPath(projectId)),
    });
}

export function useSyncBoard(projectId: string): UseMutationResult<unknown, ApiError, void> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => apiClient.post(syncPath(projectId)),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: boardQueryKey(projectId) }),
    });
}

// The timeline key sits under the board key, so the events that reload the board reload it too.
export function useItemTimeline(
    projectId: string,
    itemId: string,
): UseQueryResult<ItemTimeline, ApiError> {
    return useQuery({
        queryKey: [...boardQueryKey(projectId), TIMELINE_QUERY_KEY_PART, itemId],
        queryFn: () => apiClient.get<ItemTimeline>(timelinePath(itemId)),
    });
}

export function useMoveItemToColumn(
    projectId: string,
    itemId: string,
): UseMutationResult<unknown, ApiError, ManualColumn> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (column) => apiClient.post(columnPath(itemId), { column }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: boardQueryKey(projectId) }),
    });
}

function boardQueryKey(projectId: string): string[] {
    return [...BOARD_QUERY_KEY, projectId];
}

function boardPath(projectId: string): string {
    return `/projects/${encodeURIComponent(projectId)}/board`;
}

function syncPath(projectId: string): string {
    return `/projects/${encodeURIComponent(projectId)}/work-items/sync`;
}

function timelinePath(itemId: string): string {
    return `/work-items/${encodeURIComponent(itemId)}/timeline`;
}

function columnPath(itemId: string): string {
    return `/work-items/${encodeURIComponent(itemId)}/column`;
}
