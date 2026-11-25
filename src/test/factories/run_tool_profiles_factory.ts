import { DEFAULT_PRESET_ID, findPresetById } from "@/server/tool_profiles/tool_profile_presets.js";
import type { RunToolProfiles } from "@/server/runtime/run_tool_profiles.js";
import type { ToolProfile } from "@/shared/tool_profile_types.js";

// Every node gets the default preset, and no credential exists.
export function buildRunToolProfiles(): RunToolProfiles {
    return {
        profileOf: defaultPreset,
        credentialEnv: () => undefined,
        packageManager: null,
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
