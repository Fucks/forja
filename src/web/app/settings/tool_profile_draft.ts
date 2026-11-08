import { extractToolProfileInput, toolProfileInput } from "@/shared/tool_profile_types.js";
import type { McpServer, ToolProfile, ToolProfileInput } from "@/shared/tool_profile_types.js";

const ENV_ASSIGNMENT_SEPARATOR = "=";
const LINE_BREAK = "\n";

// Args and env are edited as free text (one entry per line) so a half-typed line is never lost.
export interface McpServerDraft {
    name: string;
    command: string;
    argsText: string;
    envText: string;
}

export interface ToolProfileDraft extends Omit<ToolProfileInput, "mcpServers"> {
    mcpServers: McpServerDraft[];
}

export const EMPTY_MCP_SERVER_DRAFT: McpServerDraft = {
    name: "",
    command: "",
    argsText: "",
    envText: "",
};

const NEW_TOOL_PROFILE_INPUT: ToolProfileInput = {
    ...toolProfileInput.omit({ name: true }).parse({}),
    name: "",
};

export function toToolProfileDraft(profile?: ToolProfile): ToolProfileDraft {
    const source = profile ? extractToolProfileInput(profile) : NEW_TOOL_PROFILE_INPUT;

    return { ...source, mcpServers: source.mcpServers.map(toMcpServerDraft) };
}

export function buildToolProfileInput(draft: ToolProfileDraft): ToolProfileInput {
    return { ...draft, mcpServers: draft.mcpServers.map(toMcpServer) };
}

function toMcpServerDraft(server: McpServer): McpServerDraft {
    const envLines = Object.entries(server.env).map(
        ([variable, envValue]) => `${variable}${ENV_ASSIGNMENT_SEPARATOR}${envValue}`,
    );

    return {
        name: server.name,
        command: server.command,
        argsText: server.args.join(LINE_BREAK),
        envText: envLines.join(LINE_BREAK),
    };
}

function toMcpServer(draft: McpServerDraft): McpServer {
    return {
        name: draft.name.trim(),
        command: draft.command.trim(),
        args: splitNonEmptyLines(draft.argsText),
        env: parseEnvAssignments(draft.envText),
    };
}

function splitNonEmptyLines(text: string): string[] {
    return text
        .split(LINE_BREAK)
        .map((line) => line.trim())
        .filter((line) => line !== "");
}

function parseEnvAssignments(envText: string): Record<string, string> {
    return Object.fromEntries(splitNonEmptyLines(envText).map(parseEnvAssignment));
}

function parseEnvAssignment(line: string): [variable: string, envValue: string] {
    const separatorIndex = line.indexOf(ENV_ASSIGNMENT_SEPARATOR);
    if (separatorIndex === -1) {
        return [line, ""];
    }

    return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1)];
}
