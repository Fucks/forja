import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type { FlowDraft, FlowVersion, FlowVersionSummary } from "@/shared/flow_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { PROJECT_FLOWS_QUERY_KEY } from "@/web/app/flows/use_flow_summary.js";

const FLOW_VERSION_QUERY_KEY = "flow-version";
const FLOW_VERSIONS_QUERY_KEY = "flow-versions";
// Not the editor's draft query: that one feeds the editor store and is never refetched behind it.
const SAVED_FLOW_DRAFT_QUERY_KEY = "saved-flow-draft";

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

/** Oldest first. */
export function useFlowVersions(flowId: string): UseQueryResult<FlowVersionSummary[], ApiError> {
    return useQuery({
        queryKey: [FLOW_VERSIONS_QUERY_KEY, flowId],
        queryFn: () => apiClient.get<FlowVersionSummary[]>(`${flowPath(flowId)}/versions`),
    });
}

/** The draft as last saved, for reading only. */
export function useSavedFlowDraft(flowId: string): UseQueryResult<FlowDraft, ApiError> {
    return useQuery({
        queryKey: [SAVED_FLOW_DRAFT_QUERY_KEY, flowId],
        queryFn: () => apiClient.get<FlowDraft>(`${flowPath(flowId)}/draft`),
    });
}

/** Replaces the draft with the graph of the given version. */
export function useRestoreVersion(flowId: string): UseMutationResult<FlowDraft, ApiError, number> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (version: number) =>
            apiClient.post<FlowDraft>(`${flowVersionPath(flowId, version)}/restore`),
        // The flow summaries carry the draft's revision.
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: [PROJECT_FLOWS_QUERY_KEY] }),
                queryClient.invalidateQueries({ queryKey: [SAVED_FLOW_DRAFT_QUERY_KEY, flowId] }),
            ]),
    });
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

export function flowPath(flowId: string): string {
    return `/flows/${encodeURIComponent(flowId)}`;
}

function flowVersionPath(flowId: string, version: number): string {
    return `${flowPath(flowId)}/versions/${version}`;
}
