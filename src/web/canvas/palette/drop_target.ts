import type { FlowGraph, FlowGroup, NodeType, Position } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";

export function findDropGroup(graph: FlowGraph, point: Position): string | undefined {
    const containingGroups = graph.groups.filter((group) => containsPoint(group, point));

    // Groups never overlap partially, so the smallest group under the point is the innermost one.
    return containingGroups.toSorted((a, b) => area(a) - area(b))[0]?.id;
}

export function addNodeAt(
    graph: FlowGraph,
    type: NodeType,
    point: Position,
    newId: () => string,
): FlowGraph {
    const node = {
        ...createDefaultNode(type, newId(), point),
        parentGroupId: findDropGroup(graph, point),
    };

    return { ...graph, nodes: [...graph.nodes, node] };
}

function containsPoint({ position, size }: FlowGroup, point: Position): boolean {
    const isInsideHorizontally = point.x >= position.x && point.x <= position.x + size.width;
    const isInsideVertically = point.y >= position.y && point.y <= position.y + size.height;

    return isInsideHorizontally && isInsideVertically;
}

function area({ size }: FlowGroup): number {
    return size.width * size.height;
}
