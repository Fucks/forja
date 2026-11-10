import type { RunCredentials } from "@/server/runtime/run_credentials.js";

export const TEST_ANTHROPIC_API_KEY = "sk-ant-api03-factory-abcdefghijklmnop-a1b2";

// Every node runs with the same Anthropic API key, and the project has no GitHub token.
export function buildRunCredentials(): RunCredentials {
    return {
        claudeCredentialOf: () => ({ kind: "anthropic_api_key", value: TEST_ANTHROPIC_API_KEY }),
        githubToken: undefined,
    };
}
