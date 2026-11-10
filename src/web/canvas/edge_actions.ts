import type { FlowEdge, FlowGraph } from "@/shared/flow_graph.js";

export type PortRef = FlowEdge["from"];

// An input takes a single edge, so connecting to an input already in use replaces its edge.
export function connect(
    graph: FlowGraph,
    from: PortRef,
    to: PortRef,
    newId: () => string,
): FlowGraph {
    const otherEdges = graph.edges.filter((edge) => !isSamePort(edge.to, to));

    return { ...graph, edges: [...otherEdges, { id: newId(), from, to }] };
}

export function removeEdges(graph: FlowGraph, edgeIds: string[]): FlowGraph {
    const removedIds = new Set(edgeIds);

    return { ...graph, edges: graph.edges.filter((edge) => !removedIds.has(edge.id)) };
}

export function removeNodes(graph: FlowGraph, nodeIds: string[]): FlowGraph {
    const removedIds = new Set(nodeIds);
    const touchesRemovedNode = (edge: FlowEdge): boolean =>
        removedIds.has(edge.from.nodeId) || removedIds.has(edge.to.nodeId);

    return {
        ...graph,
        nodes: graph.nodes.filter((node) => !removedIds.has(node.id)),
        edges: graph.edges.filter((edge) => !touchesRemovedNode(edge)),
    };
}

function isSamePort(a: PortRef, b: PortRef): boolean {
    return a.nodeId === b.nodeId && a.port === b.port;
}
