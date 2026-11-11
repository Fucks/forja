import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { z } from "zod";

import { deriveColumns } from "@/engine/board_columns.js";
import type { BoardColumnDef } from "@/engine/board_columns.js";
import type { FlowSummary } from "@/shared/flow_types.js";
import type {
    createTriggerInput,
    ListedTrigger,
    Trigger,
    TriggerFire,
    TriggersPaused,
    TriggerWithToken,
    updateTriggerInput,
} from "@/shared/trigger_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { flowVersionQuery } from "@/web/app/flows/use_flow_versions.js";

export type CreateTriggerInput = z.input<typeof createTriggerInput>;
export type UpdateTriggerInput = z.infer<typeof updateTriggerInput>;

export interface TriggerUpdate {
    id: string;
    changes: UpdateTriggerInput;
}

const TRIGGERS_QUERY_KEY = "triggers";
const TRIGGER_HISTORY_QUERY_KEY = "trigger-history";
const TRIGGERS_PAUSED_QUERY_KEY = ["triggers-paused"];
const TRIGGERS_PAUSED_PATH = "/triggers/paused";

export function useTriggers(projectId: string): UseQueryResult<ListedTrigger[], ApiError> {
    return useQuery({
        queryKey: [TRIGGERS_QUERY_KEY, projectId],
        queryFn: () => apiClient.get<ListedTrigger[]>(projectTriggersPath(projectId)),
    });
}

export function useCreateTrigger(
    projectId: string,
): UseMutationResult<Trigger | TriggerWithToken, ApiError, CreateTriggerInput> {
    return useTriggersMutation((input: CreateTriggerInput) =>
        apiClient.post<Trigger | TriggerWithToken>(projectTriggersPath(projectId), input),
    );
}

export function useUpdateTrigger(): UseMutationResult<Trigger, ApiError, TriggerUpdate> {
    return useTriggersMutation(({ id, changes }: TriggerUpdate) =>
        apiClient.patch<Trigger>(triggerPath(id), changes),
    );
}

export function useRemoveTrigger(): UseMutationResult<void, ApiError, string> {
    return useTriggersMutation((id: string) => apiClient.delete<void>(triggerPath(id)));
}

export function useFireTrigger(): UseMutationResult<TriggerFire, ApiError, string> {
    return useTriggersMutation((id: string) =>
        apiClient.post<TriggerFire>(`${triggerPath(id)}/fire`, {}),
    );
}

/** Newest fire first. */
export function useTriggerHistory(
    triggerId: string,
    limit: number,
): UseQueryResult<TriggerFire[], ApiError> {
    return useQuery({
        queryKey: [TRIGGER_HISTORY_QUERY_KEY, triggerId, limit],
        queryFn: () =>
            apiClient.get<TriggerFire[]>(`${triggerPath(triggerId)}/history?limit=${limit}`),
    });
}

export function useTriggersPaused(): UseQueryResult<TriggersPaused, ApiError> {
    return useQuery({
        queryKey: TRIGGERS_PAUSED_QUERY_KEY,
        queryFn: () => apiClient.get<TriggersPaused>(TRIGGERS_PAUSED_PATH),
    });
}

export function useSetTriggersPaused(): UseMutationResult<TriggersPaused, ApiError, boolean> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (paused: boolean) =>
            apiClient.put<TriggersPaused>(TRIGGERS_PAUSED_PATH, { paused }),
        onSuccess: (pausedState) =>
            queryClient.setQueryData(TRIGGERS_PAUSED_QUERY_KEY, pausedState),
    });
}

// Board column triggers watch the columns of the published flow, the same ones the board shows.
export function useFlowBoardColumns(
    flow: FlowSummary | undefined,
): UseQueryResult<BoardColumnDef[], ApiError> {
    return useQuery({
        ...flowVersionQuery(flow?.id, flow?.latestVersion),
        select: (version) => deriveColumns(version.graph),
    });
}

export function hasWebhookToken(trigger: Trigger | TriggerWithToken): trigger is TriggerWithToken {
    return "token" in trigger;
}

// A fire also changes the last fire of its row and the history, so every trigger query is reloaded.
function useTriggersMutation<TResult, TVariables>(
    send: (variables: TVariables) => Promise<TResult>,
): UseMutationResult<TResult, ApiError, TVariables> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: send,
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: [TRIGGERS_QUERY_KEY] }),
                queryClient.invalidateQueries({ queryKey: [TRIGGER_HISTORY_QUERY_KEY] }),
            ]),
    });
}

function projectTriggersPath(projectId: string): string {
    return `/projects/${encodeURIComponent(projectId)}/triggers`;
}

function triggerPath(id: string): string {
    return `/triggers/${encodeURIComponent(id)}`;
}
