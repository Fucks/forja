import { findNode, isLoopExhaustedEdge } from "@/engine/graph_queries.js";
import {
    type FlowEdge,
    type FlowGraph,
    LOOP_EXHAUSTED_PORT,
    type Port,
} from "@/shared/flow_graph.js";

const LOOP_EXHAUSTED_OUTPUT: Port = {
    name: LOOP_EXHAUSTED_PORT,
    type: "workItem",
    required: false,
};

export function findSourcePort(graph: FlowGraph, edge: FlowEdge): Port | undefined {
    if (isLoopExhaustedEdge(graph, edge)) {
        return LOOP_EXHAUSTED_OUTPUT;
    }

    const sourceNode = findNode(graph, edge.from.nodeId);

    return sourceNode?.outputs.find((port) => port.name === edge.from.port);
}

export function findTargetPort(graph: FlowGraph, edge: FlowEdge): Port | undefined {
    const targetNode = findNode(graph, edge.to.nodeId);

    return targetNode?.inputs.find((port) => port.name === edge.to.port);
}
