import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type { ToolProfile, ToolProfileInput } from "@/shared/tool_profile_types.js";
import { apiClient } from "@/web/api/api_client.js";

const TOOL_PROFILES_PATH = "/tool-profiles";
const TOOL_PROFILES_QUERY_KEY = ["tool-profiles"];

interface ToolProfileChanges {
    id: string;
    input: ToolProfileInput;
}

export function useToolProfiles(): UseQueryResult<ToolProfile[]> {
    return useQuery({
        queryKey: TOOL_PROFILES_QUERY_KEY,
        queryFn: () => apiClient.get<ToolProfile[]>(TOOL_PROFILES_PATH),
    });
}

export function useCreateToolProfile(): UseMutationResult<ToolProfile, Error, ToolProfileInput> {
    return useToolProfilesMutation((input: ToolProfileInput) =>
        apiClient.post<ToolProfile>(TOOL_PROFILES_PATH, input),
    );
}

export function useUpdateToolProfile(): UseMutationResult<ToolProfile, Error, ToolProfileChanges> {
    return useToolProfilesMutation(({ id, input }: ToolProfileChanges) =>
        apiClient.put<ToolProfile>(toolProfilePath(id), input),
    );
}

export function useDuplicateToolProfile(): UseMutationResult<ToolProfile, Error, string> {
    return useToolProfilesMutation((id: string) =>
        apiClient.post<ToolProfile>(`${toolProfilePath(id)}/duplicate`),
    );
}

export function useRemoveToolProfile(): UseMutationResult<void, Error, string> {
    return useToolProfilesMutation((id: string) => apiClient.delete<void>(toolProfilePath(id)));
}

function useToolProfilesMutation<TResult, TVariables>(
    send: (variables: TVariables) => Promise<TResult>,
): UseMutationResult<TResult, Error, TVariables> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: send,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: TOOL_PROFILES_QUERY_KEY }),
    });
}

function toolProfilePath(id: string): string {
    return `${TOOL_PROFILES_PATH}/${encodeURIComponent(id)}`;
}
