import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";

const ISSUE_NUMBER_VARIABLE = "{{item.number}}";
const ITEM_ID_VARIABLE = "{{item.id}}";

// The templates work on GitHub issues; local items have no number and no label to filter by.
export function adaptFlowToLocalItems(graph: FlowGraph): FlowGraph {
    return { ...graph, nodes: graph.nodes.map(adaptNodeToLocalItems) };
}

function adaptNodeToLocalItems(node: FlowNode): FlowNode {
    switch (node.type) {
        case "source":
            return { ...node, config: { ...node.config, provider: "local", label: undefined } };
        case "agent":
            return {
                ...node,
                config: { ...node.config, prompt: nameItemById(node.config.prompt) },
            };
        default:
            return node;
    }
}

function nameItemById(prompt: string): string {
    return prompt.replaceAll(ISSUE_NUMBER_VARIABLE, ITEM_ID_VARIABLE);
}
