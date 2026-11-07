import {
    enclosingMapGroup,
    findNode,
    incomingEdges,
    isNodeInsideGroup,
    topologicalOrder,
} from "@/engine/graph_queries.js";
import type { FlowEdge, FlowGraph, PortType } from "@/shared/flow_graph.js";

// "item": one NodeRun per work item; "run": a single NodeRun for the whole run.
export type NodeScope = "item" | "run";

export function planNodeScopes(graph: FlowGraph): Map<string, NodeScope> {
    const scopes = new Map<string, NodeScope>();
    for (const nodeId of topologicalOrder(graph)) {
        scopes.set(nodeId, isOnItemPath(graph, nodeId, scopes) ? "item" : "run");
    }

    return scopes;
}

export function splitsListIntoItems(graph: FlowGraph, edge: FlowEdge): boolean {
    return (
        sourcePortType(graph, edge) === "workItemList" && targetPortType(graph, edge) === "workItem"
    );
}

// The map's per-item outputs leave the map as a single list, in input order.
export function collectsItemsIntoList(graph: FlowGraph, edge: FlowEdge): boolean {
    const sourceMap = enclosingMapGroup(graph, edge.from.nodeId);
    if (!sourceMap || isNodeInsideGroup(graph, edge.to.nodeId, sourceMap.id)) {
        return false;
    }

    return targetPortType(graph, edge) === "workItemList";
}

function isOnItemPath(
    graph: FlowGraph,
    nodeId: string,
    upstreamScopes: Map<string, NodeScope>,
): boolean {
    if (enclosingMapGroup(graph, nodeId)) {
        return true;
    }

    return incomingEdges(graph, nodeId).some(
        (edge) =>
            splitsListIntoItems(graph, edge) || bringsItemFromUpstream(graph, edge, upstreamScopes),
    );
}

function bringsItemFromUpstream(
    graph: FlowGraph,
    edge: FlowEdge,
    upstreamScopes: Map<string, NodeScope>,
): boolean {
    return upstreamScopes.get(edge.from.nodeId) === "item" && !collectsItemsIntoList(graph, edge);
}

function sourcePortType(graph: FlowGraph, edge: FlowEdge): PortType | undefined {
    const sourceNode = findNode(graph, edge.from.nodeId);

    return sourceNode?.outputs.find((port) => port.name === edge.from.port)?.type;
}

function targetPortType(graph: FlowGraph, edge: FlowEdge): PortType | undefined {
    const targetNode = findNode(graph, edge.to.nodeId);

    return targetNode?.inputs.find((port) => port.name === edge.to.port)?.type;
}
