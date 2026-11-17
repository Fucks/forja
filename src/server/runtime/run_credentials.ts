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
import { NotFoundError } from "@/server/errors.js";
import { nodesThatRunAgents } from "@/server/runtime/executors/rebaser_node.js";
import { resolveAgentDefaults } from "@/server/settings/resolve_agent_defaults.js";
import { type FlowGraph, isNodeOfType } from "@/shared/flow_graph.js";
import type { ProjectSettings } from "@/shared/settings_types.js";

/** The credentials the agents of a run need, revealed once when the run is set up. */
export interface RunCredentials {
    /** @throws MissingCredentialError when neither the node nor the project has one */
    claudeCredentialOf(node: AgentNode): ClaudeCredential;
    /** The project's GitHub token; without one, `gh` falls back to the host's own login. */
    githubToken: string | undefined;
    /** @throws NotFoundError for a credential that no script env of the run reads */
    credentialValueOf(credentialId: string): string;
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
    { graph, settings }: RunCredentialsSource,
    deps: RunCredentialsDeps,
): Promise<RunCredentials> {
    const agentCredentialIds = nodesThatRunAgents(graph).map((node) =>
        credentialIdOf(node, settings),
    );
    const [claudeCredentials, github, scriptCredentialValues] = await Promise.all([
        revealClaudeCredentials(agentCredentialIds, deps),
        revealOptionalCredential(settings.githubCredentialId, deps),
        revealScriptCredentials(graph, deps),
    ]);

    return {
        claudeCredentialOf: (node) =>
            findClaudeCredential(claudeCredentials, credentialIdOf(node, settings)),
        githubToken: github?.value,
        credentialValueOf: (credentialId) =>
            findCredentialValue(scriptCredentialValues, credentialId),
    };
}

function credentialIdOf(node: AgentNode, settings: ProjectSettings): string | null {
    return resolveAgentDefaults(settings, node.config).credentialId;
}

async function revealClaudeCredentials(
    credentialIds: (string | null)[],
    deps: RunCredentialsDeps,
): Promise<Map<string, ClaudeCredential>> {
    const uniqueIds = [...new Set(credentialIds)].filter((id) => id !== null);
    const revealed = await Promise.all(
        uniqueIds.map(async (id) => ({ id, credential: await revealAndMaskInLogs(id, deps) })),
    );

    const claudeCredentials = new Map<string, ClaudeCredential>();
    for (const { id, credential } of revealed) {
        if (isClaudeCredentialKind(credential.kind)) {
            claudeCredentials.set(id, { kind: credential.kind, value: credential.value });
        }
    }
    return claudeCredentials;
}

async function revealScriptCredentials(
    graph: FlowGraph,
    deps: RunCredentialsDeps,
): Promise<Map<string, string>> {
    const credentialIds = new Set(credentialIdsOfScriptEnvs(graph));
    const revealed = await Promise.all(
        [...credentialIds].map(async (id) => {
            const credential = await revealAndMaskInLogs(id, deps);
            return [id, credential.value] as const;
        }),
    );

    return new Map(revealed);
}

function credentialIdsOfScriptEnvs(graph: FlowGraph): string[] {
    return graph.nodes.flatMap((node) => {
        if (!isNodeOfType(node, "script")) {
            return [];
        }

        return node.config.env.flatMap((envVar) => envVar.credentialId ?? []);
    });
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
function findCredentialValue(values: Map<string, string>, credentialId: string): string {
    const value = values.get(credentialId);
    if (value === undefined) {
        throw new NotFoundError(`Credencial ${credentialId} não encontrada.`);
    }

    return value;
}

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
