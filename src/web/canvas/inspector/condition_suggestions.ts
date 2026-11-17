import { listUpstreamNodes, nodesInsideGroup } from "@/engine/graph_queries.js";
import { buildNodeOutputPath } from "@/shared/data_context.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";

// Paths a condition can read: each output of every node upstream, nearest nodes first.
export function listUpstreamOutputPaths(graph: FlowGraph, nodeId: string): string[] {
    return listUpstreamNodes(graph, nodeId).flatMap(listOutputPaths);
}

// Paths a loop condition can read: each output of every node inside the group.
export function listGroupOutputPaths(graph: FlowGraph, groupId: string): string[] {
    return nodesInsideGroup(graph, groupId).flatMap(listOutputPaths);
}

function listOutputPaths(node: FlowNode): string[] {
    const slug = nodeSlug(node.label);

    return node.outputs.map((port) => buildNodeOutputPath(slug, port.name));
}
