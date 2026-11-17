import type { HandleType } from "@xyflow/react";

import { NODE_TYPES } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowNode, NodeType, Port, PortType } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { checkHandles, OPPOSITE_HANDLE_TYPES } from "@/web/canvas/connection_hints.js";

const PROBE_NODE_ID = "probe";
const CANDIDATE_NODE_ID = "candidate";
const PROBE_PORT_NAME = "probe";
const ORIGIN = { x: 0, y: 0 };

export function listCompatibleNodeTypes(portType: PortType, from: HandleType): NodeType[] {
    return NODE_TYPES.filter(
        (nodeType) => findFirstCompatiblePort(nodeType, portType, from) !== undefined,
    );
}

// The dragged port is played by a probe node, so the canvas connection rules decide what fits.
export function findFirstCompatiblePort(
    nodeType: NodeType,
    portType: PortType,
    from: HandleType,
): string | undefined {
    const candidate = createDefaultNode(nodeType, CANDIDATE_NODE_ID, ORIGIN);
    const graph = buildProbeGraph(createProbeNode(portType, from), candidate);
    const candidatePorts = from === "source" ? candidate.inputs : candidate.outputs;

    return candidatePorts.find((port) => connectsToProbe(graph, port, from))?.name;
}

function createProbeNode(portType: PortType, from: HandleType): FlowNode {
    const probePort: Port = { name: PROBE_PORT_NAME, type: portType, required: false };
    const probe = createDefaultNode("script", PROBE_NODE_ID, ORIGIN);
    if (from === "source") {
        return { ...probe, inputs: [], outputs: [probePort] };
    }

    return { ...probe, inputs: [probePort], outputs: [] };
}

function buildProbeGraph(probe: FlowNode, candidate: FlowNode): FlowGraph {
    return { schemaVersion: 1, nodes: [probe, candidate], edges: [], groups: [] };
}

function connectsToProbe(graph: FlowGraph, candidatePort: Port, from: HandleType): boolean {
    const probeHandle = { nodeId: PROBE_NODE_ID, port: PROBE_PORT_NAME, type: from };
    const candidateHandle = {
        nodeId: CANDIDATE_NODE_ID,
        port: candidatePort.name,
        type: OPPOSITE_HANDLE_TYPES[from],
    };

    return checkHandles(graph, probeHandle, candidateHandle).ok;
}
