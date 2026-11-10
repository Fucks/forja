import { DEFAULT_PRESET_ID, findPresetById } from "@/server/tool_profiles/tool_profile_presets.js";
import type { RunToolProfiles } from "@/server/runtime/run_tool_profiles.js";
import type { ToolProfile } from "@/shared/tool_profile_types.js";

// Every node gets the given profile, and no credential exists.
export function buildRunToolProfiles(profile: ToolProfile = defaultPreset()): RunToolProfiles {
    return {
        profileOf: () => profile,
        credentialEnv: () => undefined,
        hasPackageJson: false,
        workspaceSetupCommands: [],
    };
}

function defaultPreset(): ToolProfile {
    const preset = findPresetById(DEFAULT_PRESET_ID);
    if (!preset) {
        throw new Error(`Preset ${DEFAULT_PRESET_ID} not found`);
    }

    return preset;
}
