import { enclosingMapGroup, findNode, incomingEdges } from "@/engine/graph_queries.js";
import type { FlowEdge, FlowGraph, FlowNode, Port } from "@/shared/flow_graph.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

export interface PortOrigin {
    nodeLabel: string;
    portLabel: string;
}

export type InputSourceState =
    | { status: "connected"; origins: PortOrigin[] }
    | { status: "automatic" }
    | { status: "unconnected" };

export interface InputSource {
    portName: string;
    source: InputSourceState;
}

export function listInputSources(graph: FlowGraph, node: FlowNode): InputSource[] {
    const edges = incomingEdges(graph, node.id);

    return node.inputs.map((port) => ({
        portName: port.name,
        source: describeInputSource(graph, node, port, edges),
    }));
}

function describeInputSource(
    graph: FlowGraph,
    node: FlowNode,
    port: Port,
    edges: FlowEdge[],
): InputSourceState {
    const origins = edges
        .filter((edge) => edge.to.port === port.name)
        .flatMap((edge) => describeOrigin(graph, edge));
    if (origins.length > 0) {
        return { status: "connected", origins };
    }
    if (receivesMapItem(graph, node, port)) {
        return { status: "automatic" };
    }

    return { status: "unconnected" };
}

// Inside a Map, an unconnected work item input receives the item of the current iteration.
function receivesMapItem(graph: FlowGraph, node: FlowNode, port: Port): boolean {
    return port.type === "workItem" && enclosingMapGroup(graph, node.id) !== undefined;
}

function describeOrigin(graph: FlowGraph, edge: FlowEdge): PortOrigin[] {
    const originNode = findNode(graph, edge.from.nodeId);
    if (!originNode) {
        return [];
    }

    return [
        { nodeLabel: originNode.label, portLabel: outputPortLabel(originNode, edge.from.port) },
    ];
}

function outputPortLabel(node: FlowNode, portName: string): string {
    const portDoc = getNodeDoc(node.type).ports.outputs.find((port) => port.name === portName);

    return portDoc?.label ?? portName;
}
