import { findNode } from "@/engine/graph_queries.js";
import type { FlowEdge, FlowGraph, Port } from "@/shared/flow_graph.js";

export function findSourcePort(graph: FlowGraph, edge: FlowEdge): Port | undefined {
    const sourceNode = findNode(graph, edge.from.nodeId);

    return sourceNode?.outputs.find((port) => port.name === edge.from.port);
}

export function findTargetPort(graph: FlowGraph, edge: FlowEdge): Port | undefined {
    const targetNode = findNode(graph, edge.to.nodeId);

    return targetNode?.inputs.find((port) => port.name === edge.to.port);
}
