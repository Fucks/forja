import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import type { FlowSummary } from "@/shared/flow_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";

const PROJECT_FLOWS_QUERY_KEY = "project-flows";

export function useFlowSummary(
    projectId: string,
    flowId: string,
): UseQueryResult<FlowSummary | undefined, ApiError> {
    return useQuery({
        queryKey: [PROJECT_FLOWS_QUERY_KEY, projectId],
        queryFn: () => apiClient.get<FlowSummary[]>(projectFlowsPath(projectId)),
        select: (flows) => flows.find((flow) => flow.id === flowId),
    });
}

function projectFlowsPath(projectId: string): string {
    return `/projects/${encodeURIComponent(projectId)}/flows`;
}
