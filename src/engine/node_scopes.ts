import { findNode, incomingEdges, topologicalOrder } from "@/engine/graph_queries.js";
import type { FlowEdge, FlowGraph, PortType } from "@/shared/flow_graph.js";

// "item": one NodeRun per work item; "run": a single NodeRun for the whole run.
export type NodeScope = "item" | "run";

export function planNodeScopes(graph: FlowGraph): Map<string, NodeScope> {
    const scopes = new Map<string, NodeScope>();
    for (const nodeId of topologicalOrder(graph)) {
        const isOnItemPath = incomingEdges(graph, nodeId).some(
            (edge) => splitsListIntoItems(graph, edge) || scopes.get(edge.from.nodeId) === "item",
        );
        scopes.set(nodeId, isOnItemPath ? "item" : "run");
    }

    return scopes;
}

export function splitsListIntoItems(graph: FlowGraph, edge: FlowEdge): boolean {
    return (
        sourcePortType(graph, edge) === "workItemList" && targetPortType(graph, edge) === "workItem"
    );
}

function sourcePortType(graph: FlowGraph, edge: FlowEdge): PortType | undefined {
    const sourceNode = findNode(graph, edge.from.nodeId);

    return sourceNode?.outputs.find((port) => port.name === edge.from.port)?.type;
}

function targetPortType(graph: FlowGraph, edge: FlowEdge): PortType | undefined {
    const targetNode = findNode(graph, edge.to.nodeId);

    return targetNode?.inputs.find((port) => port.name === edge.to.port)?.type;
}
