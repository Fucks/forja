import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type { DiagnosticReport } from "@/shared/diagnostic_types.js";
import { apiClient } from "@/web/api/api_client.js";

const DIAGNOSTICS_PATH = "/diagnostics";
const FORCED_DIAGNOSTICS_PATH = `${DIAGNOSTICS_PATH}?force=1`;
const DIAGNOSTICS_QUERY_KEY = ["diagnostics"];

export function useDiagnostics(): UseQueryResult<DiagnosticReport> {
    return useQuery({
        queryKey: DIAGNOSTICS_QUERY_KEY,
        queryFn: () => apiClient.get<DiagnosticReport>(DIAGNOSTICS_PATH),
    });
}

export function useRecheckDiagnostics(): UseMutationResult<DiagnosticReport, Error, void> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => apiClient.get<DiagnosticReport>(FORCED_DIAGNOSTICS_PATH),
        onSuccess: (report) => queryClient.setQueryData(DIAGNOSTICS_QUERY_KEY, report),
    });
}
