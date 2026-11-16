import type {
    FlowEdge,
    FlowGraph,
    FlowGroup,
    FlowNode,
    Port,
    Position,
} from "@/shared/flow_graph.js";
import { withKeysInOrder } from "@/shared/with_keys_in_order.js";

const GRAPH_KEY_ORDER = ["schemaVersion", "nodes", "groups", "edges"] as const;
const NODE_KEY_ORDER = [
    "id",
    "type",
    "label",
    "parentGroupId",
    "position",
    "inputs",
    "outputs",
    "config",
] as const;
const PORT_KEY_ORDER = ["name", "type", "required", "description", "schema"] as const;
const GROUP_KEY_ORDER = [
    "id",
    "kind",
    "label",
    "parentGroupId",
    "position",
    "size",
    "config",
] as const;
const EDGE_KEY_ORDER = ["id", "from", "to"] as const;

/** Sorts nodes, groups and edges, rounds positions and fixes the key order, so equal graphs export
 * to identical text. */
export function normalizeFlowGraph(graph: FlowGraph): FlowGraph {
    const normalizedGraph = {
        ...graph,
        nodes: [...graph.nodes].sort(compareById).map(normalizeNode),
        groups: [...graph.groups].sort(compareById).map(normalizeGroup),
        edges: [...graph.edges].sort(compareEdgeEnds).map(normalizeEdge),
    };

    return withKeysInOrder(normalizedGraph, GRAPH_KEY_ORDER);
}

// Code-unit order instead of localeCompare, so the result is the same on every machine.
function compareText(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }

    return 0;
}

function compareById(a: { id: string }, b: { id: string }): number {
    return compareText(a.id, b.id);
}

function compareEdgeEnds(a: FlowEdge, b: FlowEdge): number {
    return (
        compareText(a.from.nodeId, b.from.nodeId) ||
        compareText(a.from.port, b.from.port) ||
        compareText(a.to.nodeId, b.to.nodeId) ||
        compareText(a.to.port, b.to.port)
    );
}

function normalizeNode(node: FlowNode): FlowNode {
    const normalizedNode = {
        ...node,
        position: roundPosition(node.position),
        inputs: node.inputs.map(normalizePort),
        outputs: node.outputs.map(normalizePort),
    };

    return withKeysInOrder(normalizedNode, NODE_KEY_ORDER);
}

function normalizePort(port: Port): Port {
    return withKeysInOrder(port, PORT_KEY_ORDER);
}

function normalizeGroup(group: FlowGroup): FlowGroup {
    return withKeysInOrder({ ...group, position: roundPosition(group.position) }, GROUP_KEY_ORDER);
}

function normalizeEdge(edge: FlowEdge): FlowEdge {
    return withKeysInOrder(edge, EDGE_KEY_ORDER);
}

function roundPosition(position: Position): Position {
    return { x: Math.round(position.x), y: Math.round(position.y) };
}
