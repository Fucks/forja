import type { Effort } from "@/shared/agent_types.js";
import type { ProjectSettings } from "@/shared/settings_types.js";

export interface AgentDefaults {
    credentialId: string | null;
    model: string;
    effort: Effort;
    toolProfileId: string;
    systemPrompt: string;
    image: string;
}

export function resolveAgentDefaults(
    project: ProjectSettings,
    node: Partial<{ credentialId: string; model: string; effort: Effort; toolProfileId: string }>,
): AgentDefaults {
    return {
        credentialId: node.credentialId ?? project.defaultCredentialId,
        model: node.model ?? project.defaultModel,
        effort: node.effort ?? project.defaultEffort,
        toolProfileId: node.toolProfileId ?? project.defaultToolProfileId,
        systemPrompt: project.systemPrompt,
        image: project.agentImage,
    };
}
