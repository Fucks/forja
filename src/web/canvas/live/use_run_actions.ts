import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";

import type { RaiseRunBudgetRequest } from "@/shared/run_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { runViewQueryKey } from "@/web/canvas/live/use_live_run.js";

type RunAction = UseMutationResult<void, ApiError, void>;

export interface RunActions {
    pause: RunAction;
    resume: RunAction;
    cancel: RunAction;
    raiseBudget: UseMutationResult<void, ApiError, RaiseRunBudgetRequest>;
}

export function useRunActions(runId: string): RunActions {
    const runPath = `/runs/${encodeURIComponent(runId)}`;

    return {
        pause: useRunMutation(runId, () => apiClient.post<void>(`${runPath}/pause`)),
        resume: useRunMutation(runId, () => apiClient.post<void>(`${runPath}/resume`)),
        cancel: useRunMutation(runId, () => apiClient.post<void>(`${runPath}/cancel`)),
        raiseBudget: useRunMutation(runId, (request: RaiseRunBudgetRequest) =>
            apiClient.post<void>(`${runPath}/budget`, request),
        ),
    };
}

// The stream also reports the change; reloading keeps the bar right if that event is missed.
function useRunMutation<TVariables>(
    runId: string,
    send: (variables: TVariables) => Promise<void>,
): UseMutationResult<void, ApiError, TVariables> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: send,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: runViewQueryKey(runId) }),
    });
}
