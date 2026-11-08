import type { ValidationContext } from "@/engine/graph_validation.js";
import type { CredentialRepository } from "@/server/credentials/credential_repository.js";

// TODO(#23): add the ids of the existing tool profiles as knownToolProfileIds.
export function buildValidationContext(
    credentials: CredentialRepository,
): Promise<ValidationContext> {
    const knownCredentialIds = credentials.list().map((credential) => credential.id);
    return Promise.resolve({ knownCredentialIds });
}
