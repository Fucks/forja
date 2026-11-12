import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import type { UsageAggregate, UsageQuery } from "@/shared/usage_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";

export type UsageRow = UsageAggregate;

export interface UsageRowsQuery {
    from: string;
    to: string;
    groupBy: UsageQuery["groupBy"];
    flowId?: string;
    nodeId?: string;
}

const USAGE_QUERY_KEY = "usage";

export function useUsage(
    projectId: string,
    query: UsageRowsQuery,
): UseQueryResult<UsageRow[], ApiError> {
    return useQuery<UsageRow[], ApiError>({
        queryKey: [USAGE_QUERY_KEY, projectId, query],
        queryFn: () => apiClient.get<UsageRow[]>(projectUsagePath(projectId, query)),
    });
}

function projectUsagePath(projectId: string, query: UsageRowsQuery): string {
    const searchParams = new URLSearchParams({
        from: query.from,
        to: query.to,
        groupBy: query.groupBy,
    });
    if (query.flowId !== undefined) {
        searchParams.set("flowId", query.flowId);
    }
    if (query.nodeId !== undefined) {
        searchParams.set("nodeId", query.nodeId);
    }

    return `/projects/${encodeURIComponent(projectId)}/usage?${searchParams.toString()}`;
}
