import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import type { FlowSummary } from "@/shared/flow_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";

const PROJECT_FLOWS_QUERY_KEY = "project-flows";

export function useProjectFlows(projectId: string): UseQueryResult<FlowSummary[], ApiError> {
    return useQuery(projectFlowsQuery(projectId));
}

export function useFlowSummary(
    projectId: string,
    flowId: string,
): UseQueryResult<FlowSummary | undefined, ApiError> {
    return useQuery({
        ...projectFlowsQuery(projectId),
        select: (flows) => flows.find((flow) => flow.id === flowId),
    });
}

function projectFlowsQuery(projectId: string): {
    queryKey: string[];
    queryFn: () => Promise<FlowSummary[]>;
} {
    return {
        queryKey: [PROJECT_FLOWS_QUERY_KEY, projectId],
        queryFn: () => apiClient.get<FlowSummary[]>(projectFlowsPath(projectId)),
    };
}

function projectFlowsPath(projectId: string): string {
    return `/projects/${encodeURIComponent(projectId)}/flows`;
}
