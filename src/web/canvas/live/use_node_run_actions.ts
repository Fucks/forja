import type { UseMutationResult } from "@tanstack/react-query";

import type { SerializedNodeRun } from "@/shared/run_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { useRunMutation } from "@/web/canvas/live/use_run_actions.js";

export type NodeRunAction = UseMutationResult<void, ApiError, void>;

export interface NodeRunActions {
    cancel: NodeRunAction;
    retry: NodeRunAction;
}

export function useNodeRunActions(nodeRun: SerializedNodeRun): NodeRunActions {
    const nodeRunPath = `/node-runs/${encodeURIComponent(nodeRun.id)}`;

    return {
        cancel: useRunMutation(nodeRun.runId, () => apiClient.post<void>(`${nodeRunPath}/cancel`)),
        retry: useRunMutation(nodeRun.runId, () => apiClient.post<void>(`${nodeRunPath}/retry`)),
    };
}
