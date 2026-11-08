import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type { GlobalSettings, ProjectSettings } from "@/shared/settings_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";

const GLOBAL_SETTINGS_PATH = "/settings";
const GLOBAL_SETTINGS_QUERY_KEY = ["settings"];
const PROJECT_SETTINGS_QUERY_KEY = ["project-settings"];

export interface SettingsChanges {
    project?: ProjectSettings;
    global?: GlobalSettings;
}

export function useProjectSettings(projectId: string): UseQueryResult<ProjectSettings> {
    return useQuery({
        queryKey: [...PROJECT_SETTINGS_QUERY_KEY, projectId],
        queryFn: () => apiClient.get<ProjectSettings>(projectSettingsPath(projectId)),
    });
}

export function useGlobalSettings(): UseQueryResult<GlobalSettings> {
    return useQuery({
        queryKey: GLOBAL_SETTINGS_QUERY_KEY,
        queryFn: () => apiClient.get<GlobalSettings>(GLOBAL_SETTINGS_PATH),
    });
}

export function useSaveSettings(
    projectId: string,
): UseMutationResult<void, ApiError, SettingsChanges> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (changes) => saveSettingsChanges(projectId, changes),
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: PROJECT_SETTINGS_QUERY_KEY }),
                queryClient.invalidateQueries({ queryKey: GLOBAL_SETTINGS_QUERY_KEY }),
            ]),
    });
}

async function saveSettingsChanges(projectId: string, changes: SettingsChanges): Promise<void> {
    const saves: Promise<unknown>[] = [];
    if (changes.project) {
        saves.push(apiClient.put(projectSettingsPath(projectId), changes.project));
    }
    if (changes.global) {
        saves.push(apiClient.put(GLOBAL_SETTINGS_PATH, changes.global));
    }

    await Promise.all(saves);
}

function projectSettingsPath(projectId: string): string {
    return `/projects/${encodeURIComponent(projectId)}/settings`;
}
