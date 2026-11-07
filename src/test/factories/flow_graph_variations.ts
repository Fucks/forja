import type { FlowEdge, FlowGraph, FlowGroup, FlowNode } from "@/shared/flow_graph.js";

type GroupPlacement = Pick<FlowGroup, "parentGroupId">;

const GROUP_FRAME = { position: { x: 0, y: 0 }, size: { width: 480, height: 480 } };

export function buildMapGroup(id: string, placement: GroupPlacement = {}): FlowGroup {
    return {
        id,
        kind: "map",
        label: id,
        ...placement,
        ...GROUP_FRAME,
        config: { concurrency: 1, barrier: false, failFast: false },
    };
}

export function findEdge(graph: FlowGraph, edgeId: string): FlowEdge {
    const edge = graph.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) {
        throw new Error(`Edge ${edgeId} not found`);
    }

    return edge;
}

export function addNodes(graph: FlowGraph, nodes: FlowNode[]): FlowGraph {
    return { ...graph, nodes: [...graph.nodes, ...nodes] };
}

export function addEdges(graph: FlowGraph, edges: FlowEdge[]): FlowGraph {
    return { ...graph, edges: [...graph.edges, ...edges] };
}

export function addGroups(graph: FlowGraph, groups: FlowGroup[]): FlowGraph {
    return { ...graph, groups: [...graph.groups, ...groups] };
}

export function removeEdges(graph: FlowGraph, edgeIds: string[]): FlowGraph {
    return { ...graph, edges: graph.edges.filter((edge) => !edgeIds.includes(edge.id)) };
}

export function updateNode(
    graph: FlowGraph,
    nodeId: string,
    update: (node: FlowNode) => FlowNode,
): FlowGraph {
    return {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === nodeId ? update(node) : node)),
    };
}

export function updateGroup(
    graph: FlowGraph,
    groupId: string,
    update: (group: FlowGroup) => FlowGroup,
): FlowGraph {
    return {
        ...graph,
        groups: graph.groups.map((group) => (group.id === groupId ? update(group) : group)),
    };
}

export function moveGroup(graph: FlowGraph, groupId: string, placement: GroupPlacement): FlowGraph {
    return updateGroup(graph, groupId, (group) => ({ ...group, ...placement }));
}

export function moveNode(graph: FlowGraph, nodeId: string, parentGroupId?: string): FlowGraph {
    return updateNode(graph, nodeId, (node) => ({ ...node, parentGroupId }));
}
