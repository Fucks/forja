import { readFileSync } from "node:fs";

import type { AgentNode } from "@/engine/prompt_template.js";
import { runtimeAssetPath } from "@/lib/paths.js";
import {
    type FlowGraph,
    type FlowNode,
    isNodeOfType,
    type NodeOfType,
} from "@/shared/flow_graph.js";
import { agentConfigSchema } from "@/shared/node_configs/agent_config.js";

export type GitNode = NodeOfType<"git">;

export const REBASER_MAX_ITERATIONS = 20;
const REBASE_COMPLETION_SIGNAL = "<promise>COMPLETE</promise>";
const REBASE_PROMPT = readFileSync(
    runtimeAssetPath("prompts", "runtime", "executors", "prompts", "rebase.md"),
    "utf8",
);

// The agent that resolves the conflicts of a rebase: no config of its own, so the project's
// default model, effort, credential and tool profile apply.
export function buildRebaserNode(gitNode: GitNode): AgentNode {
    return {
        ...gitNode,
        type: "agent",
        config: agentConfigSchema.parse({
            prompt: REBASE_PROMPT,
            maxIterations: REBASER_MAX_ITERATIONS,
            completionSignal: REBASE_COMPLETION_SIGNAL,
        }),
    };
}

// The run loads the credentials and tool profiles of these nodes before any of them starts.
export function nodesThatRunAgents(graph: FlowGraph): AgentNode[] {
    const agentNodes = graph.nodes.filter((node) => isNodeOfType(node, "agent"));
    const rebaserNodes = graph.nodes.filter(isRebaseNode).map(buildRebaserNode);

    return [...agentNodes, ...rebaserNodes];
}

function isRebaseNode(node: FlowNode): node is GitNode {
    return isNodeOfType(node, "git") && node.config.action === "rebase";
}
