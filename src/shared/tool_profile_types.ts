import { z } from "zod";

import { PERMISSION_MODES } from "@/shared/agent_types.js";

export const TOOL_PROFILE_NAME_MAX_LENGTH = 60;
const TOOL_PROFILE_DESCRIPTION_MAX_LENGTH = 300;

export const mcpServerSchema = z.object({
    name: z.string().regex(/^[a-z0-9_-]+$/),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    // Values may reference stored credentials as "${cred:<id>}"; #61 resolves them in the workspace.
    env: z.record(z.string(), z.string()).default({}),
});

export type McpServer = z.infer<typeof mcpServerSchema>;

export const toolProfileInput = z.object({
    name: z.string().trim().min(1).max(TOOL_PROFILE_NAME_MAX_LENGTH),
    description: z.string().max(TOOL_PROFILE_DESCRIPTION_MAX_LENGTH).default(""),
    mcpServers: z.array(mcpServerSchema).default([]),
    // Claude Code permission rule syntax: "Read", "Bash(git log *)", "mcp__codegraph__*".
    allowedTools: z.array(z.string()).default([]),
    disallowedTools: z.array(z.string()).default([]),
    permissionMode: z.enum(PERMISSION_MODES).default("bypassPermissions"),
    // Runs "codegraph init --yes" when the workspace opens.
    indexCodegraphOnStart: z.boolean().default(false),
});

export type ToolProfileInput = z.infer<typeof toolProfileInput>;

export interface ToolProfile extends ToolProfileInput {
    id: string;
    builtin: boolean;
    createdAt: string;
    updatedAt: string;
}

export function extractToolProfileInput(profile: ToolProfile): ToolProfileInput {
    return {
        name: profile.name,
        description: profile.description,
        mcpServers: profile.mcpServers,
        allowedTools: profile.allowedTools,
        disallowedTools: profile.disallowedTools,
        permissionMode: profile.permissionMode,
        indexCodegraphOnStart: profile.indexCodegraphOnStart,
    };
}
