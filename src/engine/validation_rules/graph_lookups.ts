import type { FlowEdge, FlowGraph, FlowNode, Port } from "@/shared/flow_graph.js";

export function findNode(graph: FlowGraph, nodeId: string): FlowNode | undefined {
    return graph.nodes.find((node) => node.id === nodeId);
}

export function findSourcePort(graph: FlowGraph, edge: FlowEdge): Port | undefined {
    const sourceNode = findNode(graph, edge.from.nodeId);

    return sourceNode?.outputs.find((port) => port.name === edge.from.port);
}

export function findTargetPort(graph: FlowGraph, edge: FlowEdge): Port | undefined {
    const targetNode = findNode(graph, edge.to.nodeId);

    return targetNode?.inputs.find((port) => port.name === edge.to.port);
}
