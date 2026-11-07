import type { FlowEdge, FlowGraph, FlowGroup, FlowNode, PortType } from "@/shared/flow_graph.js";

export type MapGroup = Extract<FlowGroup, { kind: "map" }>;
export type LoopGroup = Extract<FlowGroup, { kind: "loop" }>;

export interface GroupMembers {
    nodeIds: string[];
    childGroupIds: string[];
}

export interface GroupBoundaryEdges {
    entering: FlowEdge[];
    leaving: FlowEdge[];
    back: FlowEdge[];
}

export class CycleOutsideLoopError extends Error {
    constructor(readonly nodeIds: string[]) {
        super(`Cycle outside a loop group among nodes: ${nodeIds.join(", ")}`);
        this.name = "CycleOutsideLoopError";
    }
}

export function incomingEdges(graph: FlowGraph, nodeId: string): FlowEdge[] {
    return graph.edges.filter((edge) => edge.to.nodeId === nodeId);
}

export function outgoingEdges(graph: FlowGraph, nodeId: string): FlowEdge[] {
    return graph.edges.filter((edge) => edge.from.nodeId === nodeId);
}

export function groupMembers(graph: FlowGraph, groupId: string): GroupMembers {
    return {
        nodeIds: graph.nodes
            .filter((node) => node.parentGroupId === groupId)
            .map((node) => node.id),
        childGroupIds: graph.groups
            .filter((group) => group.parentGroupId === groupId)
            .map((group) => group.id),
    };
}

export function enclosingGroups(graph: FlowGraph, nodeId: string): FlowGroup[] {
    const node = findNode(graph, nodeId);
    if (!node) {
        return [];
    }

    return groupAncestry(graph, node.parentGroupId);
}

export function groupAncestors(graph: FlowGraph, groupId: string): FlowGroup[] {
    return groupAncestry(graph, findGroup(graph, groupId)?.parentGroupId);
}

export function isNodeInsideGroup(graph: FlowGraph, nodeId: string, groupId: string): boolean {
    return enclosingGroups(graph, nodeId).some((group) => group.id === groupId);
}

export function nodesInsideGroup(graph: FlowGraph, groupId: string): FlowNode[] {
    return graph.nodes.filter((node) => isNodeInsideGroup(graph, node.id, groupId));
}

export function groupBoundaryEdges(graph: FlowGraph, groupId: string): GroupBoundaryEdges {
    const isInside = (nodeId: string) => isNodeInsideGroup(graph, nodeId, groupId);
    const crossingEdges = graph.edges.filter(
        (edge) => isInside(edge.from.nodeId) !== isInside(edge.to.nodeId),
    );

    return {
        entering: crossingEdges.filter((edge) => isInside(edge.to.nodeId)),
        leaving: crossingEdges.filter((edge) => isInside(edge.from.nodeId)),
        back: findLoopBackEdges(graph, groupId),
    };
}

export function topologicalOrder(graph: FlowGraph): string[] {
    const backEdges = new Set(graph.groups.flatMap((group) => findLoopBackEdges(graph, group.id)));
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const forwardEdges = graph.edges.filter(
        (edge) =>
            !backEdges.has(edge) && nodeIds.has(edge.from.nodeId) && nodeIds.has(edge.to.nodeId),
    );

    return sortTopologically([...nodeIds], forwardEdges);
}

export function areTypesCompatible(from: PortType, to: PortType): boolean {
    return from === "any" || to === "any" || from === to;
}

export function isItemCorrelatedEdge(graph: FlowGraph, edge: FlowEdge): boolean {
    const sourceGroups = enclosingGroups(graph, edge.from.nodeId);
    const targetGroups = enclosingGroups(graph, edge.to.nodeId);
    const sourceMap = sourceGroups.find(isMapGroup);
    const targetMap = targetGroups.find(isMapGroup);
    if (!sourceMap || !targetMap) {
        return false;
    }

    return !targetGroups.includes(sourceMap) && !sourceGroups.includes(targetMap);
}

export function findNode(graph: FlowGraph, nodeId: string): FlowNode | undefined {
    return graph.nodes.find((node) => node.id === nodeId);
}

export function findGroup(graph: FlowGraph, groupId: string | undefined): FlowGroup | undefined {
    return graph.groups.find((group) => group.id === groupId);
}

export function isMapGroup(group: FlowGroup): group is MapGroup {
    return group.kind === "map";
}

export function isLoopGroup(group: FlowGroup): group is LoopGroup {
    return group.kind === "loop";
}

function groupAncestry(graph: FlowGraph, innermostGroupId: string | undefined): FlowGroup[] {
    const ancestry: FlowGroup[] = [];
    let group = findGroup(graph, innermostGroupId);
    while (group && !ancestry.includes(group)) {
        ancestry.push(group);
        group = findGroup(graph, group.parentGroupId);
    }

    return ancestry;
}

function findLoopBackEdges(graph: FlowGraph, groupId: string): FlowEdge[] {
    const group = findGroup(graph, groupId);
    if (!group || !isLoopGroup(group)) {
        return [];
    }

    const memberIds = new Set(nodesInsideGroup(graph, groupId).map((node) => node.id));
    const internalEdges = graph.edges.filter(
        (edge) => memberIds.has(edge.from.nodeId) && memberIds.has(edge.to.nodeId),
    );
    const startNodeIds = [...entryNodeIds(graph, memberIds), ...[...memberIds].sort(compareText)];

    return findDepthFirstBackEdges(internalEdges, startNodeIds);
}

function entryNodeIds(graph: FlowGraph, memberIds: Set<string>): string[] {
    const enteringEdges = graph.edges.filter(
        (edge) => !memberIds.has(edge.from.nodeId) && memberIds.has(edge.to.nodeId),
    );

    return enteringEdges.map((edge) => edge.to.nodeId).sort(compareText);
}

function findDepthFirstBackEdges(edges: FlowEdge[], startNodeIds: string[]): FlowEdge[] {
    const visitedNodeIds = new Set<string>();
    const nodeIdsOnPath = new Set<string>();
    const backEdges: FlowEdge[] = [];

    const visit = (nodeId: string): void => {
        visitedNodeIds.add(nodeId);
        nodeIdsOnPath.add(nodeId);
        for (const edge of sortedEdgesLeaving(edges, nodeId)) {
            if (nodeIdsOnPath.has(edge.to.nodeId)) {
                backEdges.push(edge);
            } else if (!visitedNodeIds.has(edge.to.nodeId)) {
                visit(edge.to.nodeId);
            }
        }
        nodeIdsOnPath.delete(nodeId);
    };

    for (const nodeId of startNodeIds) {
        if (!visitedNodeIds.has(nodeId)) {
            visit(nodeId);
        }
    }

    return backEdges;
}

function sortedEdgesLeaving(edges: FlowEdge[], nodeId: string): FlowEdge[] {
    return edges
        .filter((edge) => edge.from.nodeId === nodeId)
        .sort((a, b) => compareText(a.to.nodeId, b.to.nodeId) || compareText(a.id, b.id));
}

function sortTopologically(nodeIds: string[], edges: FlowEdge[]): string[] {
    const order: string[] = [];
    let unplacedNodeIds = nodeIds.toSorted(compareText);
    let pendingEdges = edges;

    while (unplacedNodeIds.length > 0) {
        const nextNodeId = unplacedNodeIds.find(
            (nodeId) => !pendingEdges.some((edge) => edge.to.nodeId === nodeId),
        );
        if (nextNodeId === undefined) {
            throw new CycleOutsideLoopError(unplacedNodeIds);
        }

        order.push(nextNodeId);
        unplacedNodeIds = unplacedNodeIds.filter((nodeId) => nodeId !== nextNodeId);
        pendingEdges = pendingEdges.filter((edge) => edge.from.nodeId !== nextNodeId);
    }

    return order;
}

function compareText(a: string, b: string): number {
    if (a === b) {
        return 0;
    }

    return a < b ? -1 : 1;
}
