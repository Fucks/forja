import path from "node:path";

import { AgentRuntimeError } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    RuntimeDir,
    RuntimeFile,
    SetupCommand,
} from "@/integrations/agent_runtime/agent_runtime.js";
import type { PermissionMode } from "@/shared/agent_types.js";
import { CREDENTIAL_REFERENCE, CREDENTIAL_REFERENCE_START } from "@/shared/tool_profile_types.js";
import type { McpServer, ToolProfile } from "@/shared/tool_profile_types.js";

export interface ToolProfileMaterialization {
    mcpConfigFile: RuntimeFile;
    /** Flags for the `claude` command: the node's MCP file and its tool rules. */
    toolArgs: string[];
    permissionMode: PermissionMode;
    /** The real values the MCP file refers to; they go through the env of `docker exec`. */
    env: Record<string, string>;
    setupCommands: SetupCommand[];
}

export interface CredentialEnv {
    envVar: string;
    value: string;
}

export interface RepositoryFacts {
    hasPackageJson: boolean;
}

export interface ToolProfileMaterializationDeps extends RepositoryFacts {
    nodeId: string;
    runtimeDir: RuntimeDir;
    credentialEnv(id: string): CredentialEnv | undefined;
}

export class UnknownCredentialError extends AgentRuntimeError {
    constructor(readonly credentialId: string) {
        super(`A credencial ${credentialId} usada pelo perfil de ferramentas não existe`);
        this.name = "UnknownCredentialError";
    }
}

const MS_PER_MINUTE = 60_000;
const INSTALL_DEPENDENCIES: SetupCommand = { command: "npm i", timeoutMs: 15 * MS_PER_MINUTE };
const INDEX_WITH_CODEGRAPH: SetupCommand = {
    command: "codegraph init --yes",
    timeoutMs: 15 * MS_PER_MINUTE,
};
const MCP_CONFIG_FILE_PREFIX = "mcp-";
const MCP_CONFIG_FILE_EXTENSION = ".json";
const JSON_INDENT = 2;

export function materializeToolProfile(
    profile: ToolProfile,
    deps: ToolProfileMaterializationDeps,
): ToolProfileMaterialization {
    const credentials = findReferencedCredentials(profile, deps);
    const mcpConfigFile = buildMcpConfigFile(profile.mcpServers, credentials, deps);

    return {
        mcpConfigFile,
        toolArgs: toolArgsOf(profile, mcpConfigFile),
        permissionMode: profile.permissionMode,
        env: envOf(credentials),
        setupCommands: setupCommandsOf(profile, deps),
    };
}

/** The workspace is shared by the nodes of an item, so each setup command runs only once. */
export function workspaceSetupCommands(
    profiles: ToolProfile[],
    repository: RepositoryFacts,
): SetupCommand[] {
    const allCommands = profiles.flatMap((profile) => setupCommandsOf(profile, repository));

    return allCommands.filter(
        (setupCommand, index) =>
            allCommands.findIndex(({ command }) => command === setupCommand.command) === index,
    );
}

export function credentialIdsReferencedBy(profile: ToolProfile): string[] {
    const envValues = profile.mcpServers.flatMap((server) => Object.values(server.env));
    const credentialIds = envValues.flatMap((envValue) =>
        [...envValue.matchAll(CREDENTIAL_REFERENCE)].map(([, credentialId = ""]) => credentialId),
    );

    return [...new Set(credentialIds)];
}

function findReferencedCredentials(
    profile: ToolProfile,
    deps: ToolProfileMaterializationDeps,
): Map<string, CredentialEnv> {
    const credentials = credentialIdsReferencedBy(profile).map((credentialId) => {
        const credential = deps.credentialEnv(credentialId);
        if (!credential) {
            throw new UnknownCredentialError(credentialId);
        }

        return [credentialId, credential] as const;
    });

    return new Map(credentials);
}

function buildMcpConfigFile(
    mcpServers: McpServer[],
    credentials: Map<string, CredentialEnv>,
    { nodeId, runtimeDir }: ToolProfileMaterializationDeps,
): RuntimeFile {
    const fileName = `${MCP_CONFIG_FILE_PREFIX}${nodeId}${MCP_CONFIG_FILE_EXTENSION}`;
    const mcpConfig = {
        mcpServers: Object.fromEntries(
            mcpServers.map((server) => [server.name, toMcpServerConfig(server, credentials)]),
        ),
    };

    return {
        hostPath: path.join(runtimeDir.host, fileName),
        containerPath: path.posix.join(runtimeDir.container, fileName),
        content: JSON.stringify(mcpConfig, null, JSON_INDENT),
    };
}

// Claude Code expands `${VAR}` in the MCP file from its env, so the secret never touches the disk.
function toMcpServerConfig(
    server: McpServer,
    credentials: Map<string, CredentialEnv>,
): Omit<McpServer, "name"> {
    const env = Object.entries(server.env).map(([variable, envValue]): [string, string] => [
        variable,
        replaceCredentialReferences(envValue, credentials),
    ]);

    return { command: server.command, args: server.args, env: Object.fromEntries(env) };
}

function replaceCredentialReferences(
    envValue: string,
    credentials: Map<string, CredentialEnv>,
): string {
    return [...credentials].reduce(
        (replaced, [credentialId, credential]) =>
            replaced.replaceAll(credentialReferenceTo(credentialId), envReferenceTo(credential)),
        envValue,
    );
}

function credentialReferenceTo(credentialId: string): string {
    return `${CREDENTIAL_REFERENCE_START}${credentialId}}`;
}

function envReferenceTo(credential: CredentialEnv): string {
    return `\${${credential.envVar}}`;
}

function toolArgsOf(profile: ToolProfile, mcpConfigFile: RuntimeFile): string[] {
    return [
        ...strictMcpConfigArgs(mcpConfigFile),
        ...toolRuleArgs("--allowedTools", profile.allowedTools),
        ...toolRuleArgs("--disallowedTools", profile.disallowedTools),
    ];
}

// Without --strict-mcp-config the agent would also load the MCPs configured in the image.
function strictMcpConfigArgs(mcpConfigFile: RuntimeFile): string[] {
    return ["--mcp-config", mcpConfigFile.containerPath, "--strict-mcp-config"];
}

// One rule per argument: a rule like "Bash(git log *)" has spaces of its own.
function toolRuleArgs(flag: string, rules: string[]): string[] {
    if (rules.length === 0) {
        return [];
    }

    return [flag, ...rules];
}

function envOf(credentials: Map<string, CredentialEnv>): Record<string, string> {
    return Object.fromEntries(
        [...credentials.values()].map((credential) => [credential.envVar, credential.value]),
    );
}

function setupCommandsOf(profile: ToolProfile, repository: RepositoryFacts): SetupCommand[] {
    return [
        ...(repository.hasPackageJson ? [INSTALL_DEPENDENCIES] : []),
        ...(profile.indexCodegraphOnStart ? [INDEX_WITH_CODEGRAPH] : []),
    ];
}
