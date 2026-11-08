import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type {
    CredentialInput,
    CredentialSummary,
    UpdateCredentialInput,
} from "@/shared/credential_types.js";
import { apiClient } from "@/web/api/api_client.js";

const CREDENTIALS_PATH = "/credentials";
const CREDENTIALS_QUERY_KEY = ["credentials"];

interface CredentialChanges {
    id: string;
    changes: UpdateCredentialInput;
}

export function useCredentials(): UseQueryResult<CredentialSummary[]> {
    return useQuery({
        queryKey: CREDENTIALS_QUERY_KEY,
        queryFn: () => apiClient.get<CredentialSummary[]>(CREDENTIALS_PATH),
    });
}

export function useCreateCredential(): UseMutationResult<
    CredentialSummary,
    Error,
    CredentialInput
> {
    return useCredentialsMutation((input: CredentialInput) =>
        apiClient.post<CredentialSummary>(CREDENTIALS_PATH, input),
    );
}

export function useUpdateCredential(): UseMutationResult<
    CredentialSummary,
    Error,
    CredentialChanges
> {
    return useCredentialsMutation(({ id, changes }: CredentialChanges) =>
        apiClient.patch<CredentialSummary>(credentialPath(id), changes),
    );
}

export function useRemoveCredential(): UseMutationResult<void, Error, string> {
    return useCredentialsMutation((id: string) => apiClient.delete<void>(credentialPath(id)));
}

function useCredentialsMutation<TResult, TVariables>(
    send: (variables: TVariables) => Promise<TResult>,
): UseMutationResult<TResult, Error, TVariables> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: send,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_KEY }),
    });
}

function credentialPath(id: string): string {
    return `${CREDENTIALS_PATH}/${encodeURIComponent(id)}`;
}
