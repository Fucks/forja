import { findNode, incomingEdges } from "@/engine/graph_queries.js";
import { CONDITION_PATH_SEPARATOR } from "@/shared/conditions.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";

// Paths a condition can read: each output of every node upstream, nearest nodes first.
export function listUpstreamOutputPaths(graph: FlowGraph, nodeId: string): string[] {
    return findUpstreamNodes(graph, nodeId).flatMap(listOutputPaths);
}

function findUpstreamNodes(graph: FlowGraph, nodeId: string): FlowNode[] {
    const visitedIds = new Set([nodeId]);
    const upstreamNodes: FlowNode[] = [];
    let frontierIds = [nodeId];

    while (frontierIds.length > 0) {
        frontierIds = listSourceNodeIds(graph, frontierIds).filter((id) => !visitedIds.has(id));
        frontierIds.forEach((id) => visitedIds.add(id));
        upstreamNodes.push(...frontierIds.flatMap((id) => findNode(graph, id) ?? []));
    }

    return upstreamNodes;
}

function listSourceNodeIds(graph: FlowGraph, nodeIds: string[]): string[] {
    return nodeIds.flatMap((id) => incomingEdges(graph, id).map((edge) => edge.from.nodeId));
}

function listOutputPaths(node: FlowNode): string[] {
    const slug = nodeSlug(node.label);

    return node.outputs.map((port) => `${slug}${CONDITION_PATH_SEPARATOR}${port.name}`);
}
