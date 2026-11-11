import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type { FlowVersion } from "@/shared/flow_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { PROJECT_FLOWS_QUERY_KEY } from "@/web/app/flows/use_flow_summary.js";

const FLOW_VERSION_QUERY_KEY = "flow-version";
const FLOW_VERSIONS_QUERY_KEY = "flow-versions";

interface FlowVersionQuery {
    queryKey: [string, string | undefined, number | undefined];
    queryFn: typeof skipToken | (() => Promise<FlowVersion>);
}

// Waits while the flow or its version number is unknown (e.g. nothing published yet).
export function flowVersionQuery(
    flowId: string | undefined,
    version: number | undefined,
): FlowVersionQuery {
    return {
        queryKey: [FLOW_VERSION_QUERY_KEY, flowId, version],
        queryFn:
            flowId === undefined || version === undefined
                ? skipToken
                : () => apiClient.get<FlowVersion>(flowVersionPath(flowId, version)),
    };
}

export function useFlowVersion(
    flowId: string,
    version: number | undefined,
): UseQueryResult<FlowVersion, ApiError> {
    return useQuery(flowVersionQuery(flowId, version));
}

/** The note is optional; the server publishes the saved draft. */
export function usePublishVersion(
    flowId: string,
): UseMutationResult<FlowVersion, ApiError, string | undefined> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (note: string | undefined) =>
            apiClient.post<FlowVersion>(`${flowPath(flowId)}/publish`, { note }),
        // The flow summaries carry the latest version number.
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: [PROJECT_FLOWS_QUERY_KEY] }),
                queryClient.invalidateQueries({ queryKey: [FLOW_VERSION_QUERY_KEY, flowId] }),
                queryClient.invalidateQueries({ queryKey: [FLOW_VERSIONS_QUERY_KEY, flowId] }),
            ]),
    });
}

function flowPath(flowId: string): string {
    return `/flows/${encodeURIComponent(flowId)}`;
}

function flowVersionPath(flowId: string, version: number): string {
    return `${flowPath(flowId)}/versions/${version}`;
}
