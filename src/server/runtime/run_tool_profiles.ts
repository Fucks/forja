import path from "node:path";

import type { AgentNode } from "@/engine/prompt_template.js";
import type { SetupCommand } from "@/integrations/agent_runtime/agent_runtime.js";
import {
    credentialIdsReferencedBy,
    workspaceSetupCommands,
    type CredentialEnv,
} from "@/integrations/agent_runtime/tool_profile_materializer.js";
import type { CredentialService } from "@/server/credentials/credential_service.js";
import { NotFoundError } from "@/server/errors.js";
import { resolveAgentDefaults } from "@/server/settings/resolve_agent_defaults.js";
import type { ToolProfileService } from "@/server/tool_profiles/tool_profile_service.js";
import { isNodeOfType, type FlowGraph } from "@/shared/flow_graph.js";
import type { Project } from "@/shared/project_types.js";
import type { ProjectSettings } from "@/shared/settings_types.js";
import type { ToolProfile } from "@/shared/tool_profile_types.js";

/** The tool profiles of a run's agent nodes, with what is needed to apply them. */
export interface RunToolProfiles {
    /** The node's own profile, or the project's default one. */
    profileOf(node: AgentNode): ToolProfile;
    credentialEnv(id: string): CredentialEnv | undefined;
    hasPackageJson: boolean;
    /** The union of the profiles of the nodes that run in the item workspace. */
    workspaceSetupCommands: SetupCommand[];
}

export interface RunToolProfilesDeps {
    toolProfiles: Pick<ToolProfileService, "get">;
    credentials: Pick<CredentialService, "revealForRuntime">;
    fileExists(filePath: string): boolean;
}

export interface RunToolProfilesSource {
    graph: FlowGraph;
    project: Project;
    settings: ProjectSettings;
}

const PACKAGE_JSON = "package.json";

/** @throws NotFoundError for a profile or a credential that no longer exists */
export async function loadRunToolProfiles(
    source: RunToolProfilesSource,
    deps: RunToolProfilesDeps,
): Promise<RunToolProfiles> {
    const agentNodes = source.graph.nodes.filter((node) => isNodeOfType(node, "agent"));
    const profileIdOf = (node: AgentNode): string =>
        resolveAgentDefaults(source.settings, node.config).toolProfileId;
    const profiles = await loadProfiles(agentNodes.map(profileIdOf), deps);
    const credentials = await revealCredentials([...profiles.values()], deps);
    const hasPackageJson = deps.fileExists(path.join(source.project.repoPath, PACKAGE_JSON));
    const profileOf = (node: AgentNode): ToolProfile => findProfile(profiles, profileIdOf(node));
    const itemWorkspaceNodes = agentNodes.filter((node) => node.config.workspace === "item");

    return {
        profileOf,
        credentialEnv: (id) => credentials.get(id),
        hasPackageJson,
        workspaceSetupCommands: workspaceSetupCommands(itemWorkspaceNodes.map(profileOf), {
            hasPackageJson,
        }),
    };
}

async function loadProfiles(
    profileIds: string[],
    deps: RunToolProfilesDeps,
): Promise<Map<string, ToolProfile>> {
    const uniqueIds = [...new Set(profileIds)];
    const profiles = await Promise.all(uniqueIds.map((id) => deps.toolProfiles.get(id)));

    return new Map(profiles.map((profile) => [profile.id, profile]));
}

// Revealed once per run so that materializing a profile, node after node, stays synchronous.
async function revealCredentials(
    profiles: ToolProfile[],
    deps: RunToolProfilesDeps,
): Promise<Map<string, CredentialEnv>> {
    const credentialIds = [...new Set(profiles.flatMap(credentialIdsReferencedBy))];
    const credentials = await Promise.all(
        credentialIds.map(async (id) => [id, await deps.credentials.revealForRuntime(id)] as const),
    );

    return new Map(credentials);
}

function findProfile(profiles: Map<string, ToolProfile>, profileId: string): ToolProfile {
    const profile = profiles.get(profileId);
    if (!profile) {
        throw new NotFoundError(`Perfil de ferramentas ${profileId} não encontrado.`);
    }

    return profile;
}
