import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type { CreateProjectInput, Project } from "@/shared/project_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";

const PROJECTS_API_PATH = "/projects";
const PROJECTS_QUERY_KEY = ["projects"];

export function useProjects(): UseQueryResult<Project[]> {
    return useQuery({
        queryKey: PROJECTS_QUERY_KEY,
        queryFn: () => apiClient.get<Project[]>(PROJECTS_API_PATH),
    });
}

export function useProject(id: string): UseQueryResult<Project> {
    return useQuery({
        queryKey: [...PROJECTS_QUERY_KEY, id],
        queryFn: () => apiClient.get<Project>(`${PROJECTS_API_PATH}/${encodeURIComponent(id)}`),
    });
}

export function useCreateProject(): UseMutationResult<Project, ApiError, CreateProjectInput> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input) => apiClient.post<Project>(PROJECTS_API_PATH, input),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
    });
}
