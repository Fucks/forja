import { WorkspaceError } from "@/integrations/agent_runtime/agent_errors.js";
import { ENV_VAR_BY_KIND, type CredentialKind } from "@/shared/credential_types.js";

export type ClaudeCredentialKind = Extract<
    CredentialKind,
    "anthropic_api_key" | "claude_oauth_token"
>;

export interface ClaudeCredential {
    kind: ClaudeCredentialKind;
    value: string;
}

export interface AgentEnvInput {
    claude?: ClaudeCredential;
    github?: string;
    /** The env of the tool profile (generic_env credentials its MCP servers refer to). */
    extra: Record<string, string>;
}

/** An agent node whose Claude credential could not be resolved from the node or the project. */
export class MissingCredentialError extends WorkspaceError {
    constructor() {
        super("Configure uma credencial do Claude no projeto");
        this.name = "MissingCredentialError";
    }
}

const CLAUDE_CREDENTIAL_KINDS: readonly CredentialKind[] = [
    "anthropic_api_key",
    "claude_oauth_token",
];
const CLAUDE_ENV_VARS: ReadonlySet<string> = new Set([
    ENV_VAR_BY_KIND.anthropic_api_key,
    ENV_VAR_BY_KIND.claude_oauth_token,
]);
// `gh` reads GH_TOKEN; other GitHub tools of the agent read GITHUB_TOKEN.
const GITHUB_ENV_VARS = [ENV_VAR_BY_KIND.github_token, "GITHUB_TOKEN"];

export function buildAgentEnv(input: AgentEnvInput): Record<string, string> {
    return {
        ...withoutClaudeCredentials(input.extra),
        ...claudeEnvOf(input.claude),
        ...githubEnvOf(input.github),
    };
}

export function isClaudeCredentialKind(kind: CredentialKind): kind is ClaudeCredentialKind {
    return CLAUDE_CREDENTIAL_KINDS.includes(kind);
}

// In `claude -p` an API key always wins over the subscription, so only one of them may be set.
function withoutClaudeCredentials(env: Record<string, string>): Record<string, string> {
    const entries = Object.entries(env).filter(([variable]) => !CLAUDE_ENV_VARS.has(variable));

    return Object.fromEntries(entries);
}

function claudeEnvOf(claude: ClaudeCredential | undefined): Record<string, string> {
    if (!claude) {
        return {};
    }

    return { [ENV_VAR_BY_KIND[claude.kind]]: claude.value };
}

function githubEnvOf(token: string | undefined): Record<string, string> {
    if (token === undefined) {
        return {};
    }

    return Object.fromEntries(GITHUB_ENV_VARS.map((variable) => [variable, token]));
}
