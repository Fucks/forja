import type { AgentNode } from "@/engine/prompt_template.js";
import {
    isClaudeCredentialKind,
    MissingCredentialError,
    type ClaudeCredential,
} from "@/integrations/agent_runtime/agent_env.js";
import type { SecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import type {
    CredentialService,
    RuntimeCredential,
} from "@/server/credentials/credential_service.js";
import { resolveAgentDefaults } from "@/server/settings/resolve_agent_defaults.js";
import { isNodeOfType, type FlowGraph } from "@/shared/flow_graph.js";
import type { ProjectSettings } from "@/shared/settings_types.js";

/** The credentials the agents of a run need, revealed once when the run is set up. */
export interface RunCredentials {
    /** @throws MissingCredentialError when neither the node nor the project has one */
    claudeCredentialOf(node: AgentNode): ClaudeCredential;
    /** The project's GitHub token; without one, `gh` falls back to the host's own login. */
    githubToken: string | undefined;
}

export interface RunCredentialsDeps {
    credentials: Pick<CredentialService, "revealForRuntime">;
    redactor: Pick<SecretRedactor, "register">;
}

export interface RunCredentialsSource {
    graph: FlowGraph;
    settings: ProjectSettings;
}

/** @throws NotFoundError for a credential that no longer exists */
export async function loadRunCredentials(
    source: RunCredentialsSource,
    deps: RunCredentialsDeps,
): Promise<RunCredentials> {
    const agentNodes = source.graph.nodes.filter((node) => isNodeOfType(node, "agent"));
    const credentialIdOf = (node: AgentNode): string | null =>
        resolveAgentDefaults(source.settings, node.config).credentialId;
    const [claudeCredentials, github] = await Promise.all([
        revealClaudeCredentials(agentNodes.map(credentialIdOf), deps),
        revealOptionalCredential(source.settings.githubCredentialId, deps),
    ]);

    return {
        claudeCredentialOf: (node) => findClaudeCredential(claudeCredentials, credentialIdOf(node)),
        githubToken: github?.value,
    };
}

async function revealClaudeCredentials(
    credentialIds: (string | null)[],
    deps: RunCredentialsDeps,
): Promise<Map<string, ClaudeCredential>> {
    const uniqueIds = [...new Set(credentialIds)].filter((id) => id !== null);
    const revealed = await Promise.all(
        uniqueIds.map(async (id) => [id, await revealAndMaskInLogs(id, deps)] as const),
    );
    const claudeCredentials = revealed.flatMap(([id, { kind, value }]) =>
        isClaudeCredentialKind(kind) ? [[id, { kind, value }] as const] : [],
    );

    return new Map(claudeCredentials);
}

async function revealOptionalCredential(
    credentialId: string | null,
    deps: RunCredentialsDeps,
): Promise<RuntimeCredential | undefined> {
    if (credentialId === null) {
        return undefined;
    }

    return revealAndMaskInLogs(credentialId, deps);
}

async function revealAndMaskInLogs(
    credentialId: string,
    deps: RunCredentialsDeps,
): Promise<RuntimeCredential> {
    const credential = await deps.credentials.revealForRuntime(credentialId);
    deps.redactor.register(credential.value);

    return credential;
}

// A credential of another kind (a GitHub token, say) cannot run Claude, so it counts as missing.
function findClaudeCredential(
    claudeCredentials: Map<string, ClaudeCredential>,
    credentialId: string | null,
): ClaudeCredential {
    const credential = credentialId === null ? undefined : claudeCredentials.get(credentialId);
    if (!credential) {
        throw new MissingCredentialError();
    }

    return credential;
}
