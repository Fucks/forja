import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import type { ForjaDb } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { findPresetById } from "@/server/tool_profiles/tool_profile_presets.js";
import { ToolProfileRepository } from "@/server/tool_profiles/tool_profile_repository.js";

export interface SettingsLookups {
    projectExists(id: string): boolean;
    credentialExists(id: string): boolean;
    toolProfileExists(id: string): boolean;
}

export function createSettingsLookups(db: ForjaDb): SettingsLookups {
    const projects = new ProjectRepository(db);
    const credentials = new CredentialRepository(db);
    const toolProfiles = new ToolProfileRepository(db);

    return {
        projectExists: (id) => projects.findById(id) !== undefined,
        credentialExists: (id) => credentials.findById(id) !== undefined,
        toolProfileExists: (id) =>
            findPresetById(id) !== undefined || toolProfiles.findById(id) !== undefined,
    };
}
