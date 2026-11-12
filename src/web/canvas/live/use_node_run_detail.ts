import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import type { SerializedNodeRun, SerializedNodeRunDetail } from "@/shared/run_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";

const NODE_RUN_DETAIL_QUERY_KEY = "node-run-detail";

// The live view tells when the NodeRun changes status; its outputs and error come with the detail.
export function useNodeRunDetail(
    nodeRun: SerializedNodeRun,
): UseQueryResult<SerializedNodeRunDetail, ApiError> {
    return useQuery<SerializedNodeRunDetail, ApiError>({
        queryKey: [NODE_RUN_DETAIL_QUERY_KEY, nodeRun.id, nodeRun.status],
        queryFn: () => fetchNodeRunDetail(nodeRun.id),
    });
}

export function fetchNodeRunDetail(nodeRunId: string): Promise<SerializedNodeRunDetail> {
    return apiClient.get<SerializedNodeRunDetail>(`/node-runs/${encodeURIComponent(nodeRunId)}`);
}
