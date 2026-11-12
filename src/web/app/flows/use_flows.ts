import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type { FlowSummary, FlowTemplateSummary } from "@/shared/flow_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { PROJECT_FLOWS_QUERY_KEY, projectFlowsPath } from "@/web/app/flows/use_flow_summary.js";
import { flowPath } from "@/web/app/flows/use_flow_versions.js";

const FLOW_TEMPLATES_PATH = "/flow-templates";
const FLOW_TEMPLATES_QUERY_KEY = ["flow-templates"];
const WITH_ARCHIVED_QUERY_KEY = "with-archived";

interface CreateFlowRequest {
    name: string;
    templateId?: string;
}

interface RenameFlowRequest {
    flowId: string;
    name: string;
}

/** Archived flows included: the list page decides whether to show them. */
export function useFlows(projectId: string): UseQueryResult<FlowSummary[]> {
    return useQuery({
        queryKey: [PROJECT_FLOWS_QUERY_KEY, projectId, WITH_ARCHIVED_QUERY_KEY],
        queryFn: () =>
            apiClient.get<FlowSummary[]>(`${projectFlowsPath(projectId)}?includeArchived=true`),
    });
}

export function useFlowTemplates(): UseQueryResult<FlowTemplateSummary[]> {
    return useQuery({
        queryKey: FLOW_TEMPLATES_QUERY_KEY,
        queryFn: () => apiClient.get<FlowTemplateSummary[]>(FLOW_TEMPLATES_PATH),
    });
}

/** Without a template the flow starts blank. */
export function useCreateFlow(
    projectId: string,
): UseMutationResult<FlowSummary, ApiError, CreateFlowRequest> {
    return useFlowsMutation((request: CreateFlowRequest) => createFlow(projectId, request));
}

export function useImportFlow(projectId: string): UseMutationResult<FlowSummary, ApiError, string> {
    return useFlowsMutation((yaml: string) =>
        apiClient.post<FlowSummary>(`${projectFlowsPath(projectId)}/import`, yaml),
    );
}

export function useRenameFlow(): UseMutationResult<FlowSummary, ApiError, RenameFlowRequest> {
    return useFlowsMutation(({ flowId, name }: RenameFlowRequest) =>
        apiClient.patch<FlowSummary>(flowPath(flowId), { name }),
    );
}

/** The server unmarks the project's previous default flow. */
export function useSetDefaultFlow(): UseMutationResult<void, ApiError, string> {
    return useFlowsMutation((flowId: string) =>
        apiClient.post<void>(`${flowPath(flowId)}/default`),
    );
}

export function useArchiveFlow(): UseMutationResult<void, ApiError, string> {
    return useFlowsMutation((flowId: string) =>
        apiClient.post<void>(`${flowPath(flowId)}/archive`),
    );
}

function useFlowsMutation<TResult, TVariables>(
    mutationFn: (variables: TVariables) => Promise<TResult>,
): UseMutationResult<TResult, ApiError, TVariables> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [PROJECT_FLOWS_QUERY_KEY] }),
    });
}

function createFlow(
    projectId: string,
    { name, templateId }: CreateFlowRequest,
): Promise<FlowSummary> {
    if (templateId === undefined) {
        return apiClient.post<FlowSummary>(projectFlowsPath(projectId), { name });
    }

    return apiClient.post<FlowSummary>(`${projectFlowsPath(projectId)}/from-template`, {
        name,
        templateId,
    });
}
