import { NotFoundError } from "@/server/errors.js";
import type { RunCredentials } from "@/server/runtime/run_credentials.js";

const TEST_ANTHROPIC_API_KEY = "sk-ant-api03-factory-abcdefghijklmnop-a1b2";

// Every node runs with the same Anthropic API key, and the project has no GitHub token.
// The script envs read the given credential values, by credential id.
export function buildRunCredentials(credentialValues: Record<string, string> = {}): RunCredentials {
    return {
        claudeCredentialOf: () => ({ kind: "anthropic_api_key", value: TEST_ANTHROPIC_API_KEY }),
        githubToken: undefined,
        credentialValueOf: (credentialId) => {
            const value = credentialValues[credentialId];
            if (value === undefined) {
                throw new NotFoundError(`Credencial ${credentialId} não encontrada.`);
            }

            return value;
        },
    };
}
