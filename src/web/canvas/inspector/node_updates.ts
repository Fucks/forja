import { findNode } from "@/engine/graph_queries.js";
import type { FlowEdge, FlowGraph, FlowNode, Port } from "@/shared/flow_graph.js";

export function updateNodeConfig(
    graph: FlowGraph,
    nodeId: string,
    update: (node: FlowNode) => FlowNode,
): FlowGraph {
    const node = findNode(graph, nodeId);
    if (!node) {
        return graph;
    }

    const updatedNode = update(node);
    const isStillConnected = (edge: FlowEdge): boolean =>
        edge.to.nodeId !== nodeId || hasInputPort(updatedNode, edge.to.port);

    return {
        ...graph,
        nodes: graph.nodes.map((candidate) => (candidate.id === nodeId ? updatedNode : candidate)),
        edges: graph.edges.filter(isStillConnected),
    };
}

export function addInputPort(graph: FlowGraph, nodeId: string, port: Port): FlowGraph {
    const node = findNode(graph, nodeId);
    if (!node || !canAddInputPort(node, port.name)) {
        return graph;
    }

    return updateNodeConfig(graph, nodeId, (current) => withInputPort(current, port));
}

export function removeInputPort(graph: FlowGraph, nodeId: string, name: string): FlowGraph {
    return updateNodeConfig(graph, nodeId, (node) => withoutInputPort(node, name));
}

export function canAddInputPort(node: FlowNode, name: string): boolean {
    return node.type === "agent" && !hasInputPort(node, name);
}

export function withInputPort(node: FlowNode, port: Port): FlowNode {
    return { ...node, inputs: [...node.inputs, port] };
}

export function withoutInputPort(node: FlowNode, name: string): FlowNode {
    return { ...node, inputs: node.inputs.filter((port) => port.name !== name) };
}

function hasInputPort(node: FlowNode, name: string): boolean {
    return node.inputs.some((port) => port.name === name);
}
