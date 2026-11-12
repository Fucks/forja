import { findNode } from "@/engine/graph_queries.js";
import { validateFlowGraph } from "@/engine/graph_validation.js";
import type { ValidationContext } from "@/engine/graph_validation.js";
import { checkPromptVariables } from "@/engine/prompt_template.js";
import { TOOL_PROFILE_PRESETS } from "@/server/tool_profiles/tool_profile_presets.js";
import type { FlowGraph } from "@/shared/flow_graph.js";

const PUBLISH_CONTEXT: ValidationContext = {
    knownToolProfileIds: TOOL_PROFILE_PRESETS.map((profile) => profile.id),
    knownCredentialIds: [],
    checkPrompt: checkPromptVariables,
};

// The errors that would stop the graph from being published in a project with only the presets.
export function publishErrorsOf(graph: FlowGraph): string[] {
    return validateFlowGraph(graph, PUBLISH_CONTEXT)
        .filter((issue) => issue.level === "error")
        .map((issue) => issue.message);
}

export function agentPromptOf(graph: FlowGraph, nodeId: string): string | undefined {
    const node = findNode(graph, nodeId);
    if (node?.type !== "agent") {
        return undefined;
    }

    return node.config.prompt;
}
