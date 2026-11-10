import type { Connection, Edge, Node } from "@xyflow/react";

import type {
    FlowEdge,
    FlowGraph,
    FlowGroup,
    FlowNode,
    NodeType,
    Position,
} from "@/shared/flow_graph.js";
import type { PortRef } from "@/web/canvas/edge_actions.js";

export const GROUP_NODE_TYPE = "group";
export const FLOW_EDGE_TYPE = "flow";

// Type aliases (not interfaces) so they fit React Flow's Record<string, unknown> node data.
type FlowNodeData = { flowNode: FlowNode };
type GroupNodeData = { flowGroup: FlowGroup };

export type FlowRFNode = Node<FlowNodeData, NodeType>;
export type GroupRFNode = Node<GroupNodeData, typeof GROUP_NODE_TYPE>;
export type RFNode = FlowRFNode | GroupRFNode;
export type RFEdge = Edge;

export interface ConnectionPorts {
    from: PortRef;
    to: PortRef;
}

type GroupsById = Map<string, FlowGroup>;
type RFNodesById = Map<string, RFNode>;

// React Flow positions a child relative to its parent and needs every parent listed before its
// children; the FlowGraph keeps absolute positions in any order.
export function toReactFlow(graph: FlowGraph): { nodes: RFNode[]; edges: RFEdge[] } {
    const groupsById: GroupsById = new Map(graph.groups.map((group) => [group.id, group]));
    const groupNodes = sortParentsFirst(graph.groups, groupsById).map((group) =>
        toGroupRFNode(group, groupsById),
    );
    const flowNodes = graph.nodes.map((node) => toFlowRFNode(node, groupsById));

    return { nodes: [...groupNodes, ...flowNodes], edges: graph.edges.map(toRFEdge) };
}

export function fromReactFlow(nodes: RFNode[], edges: RFEdge[], previous: FlowGraph): FlowGraph {
    const nodesById: RFNodesById = new Map(nodes.map((node) => [node.id, node]));

    return {
        ...previous,
        nodes: previous.nodes.flatMap((node) => {
            const rfNode = nodesById.get(node.id);
            return rfNode ? [placeFlowNode(node, rfNode, nodesById)] : [];
        }),
        groups: previous.groups.flatMap((group) => {
            const rfNode = nodesById.get(group.id);
            return rfNode ? [placeFlowGroup(group, rfNode, nodesById)] : [];
        }),
        edges: edges.flatMap(toFlowEdges),
    };
}

// An edge only exists in the FlowGraph between two ports; React Flow may hold one without handles.
export function toConnectionPorts(connection: Connection | RFEdge): ConnectionPorts | undefined {
    const { source, sourceHandle, target, targetHandle } = connection;
    if (!sourceHandle || !targetHandle) {
        return undefined;
    }

    return {
        from: { nodeId: source, port: sourceHandle },
        to: { nodeId: target, port: targetHandle },
    };
}

function sortParentsFirst(groups: FlowGroup[], groupsById: GroupsById): FlowGroup[] {
    return groups.toSorted((a, b) => groupDepth(a, groupsById) - groupDepth(b, groupsById));
}

function groupDepth(group: FlowGroup, groupsById: GroupsById): number {
    const parent = findParentGroup(group.parentGroupId, groupsById);
    if (!parent) {
        return 0;
    }

    return groupDepth(parent, groupsById) + 1;
}

function toGroupRFNode(group: FlowGroup, groupsById: GroupsById): GroupRFNode {
    const parent = findParentGroup(group.parentGroupId, groupsById);

    return {
        id: group.id,
        type: GROUP_NODE_TYPE,
        // Removing a group means ungrouping its nodes, which the grouping tools own.
        deletable: false,
        parentId: parent?.id,
        position: relativeToParent(group.position, parent),
        width: group.size.width,
        height: group.size.height,
        data: { flowGroup: group },
    };
}

function toFlowRFNode(node: FlowNode, groupsById: GroupsById): FlowRFNode {
    const parent = findParentGroup(node.parentGroupId, groupsById);

    return {
        id: node.id,
        type: node.type,
        parentId: parent?.id,
        position: relativeToParent(node.position, parent),
        data: { flowNode: node },
    };
}

function toRFEdge(edge: FlowEdge): RFEdge {
    return {
        id: edge.id,
        type: FLOW_EDGE_TYPE,
        source: edge.from.nodeId,
        sourceHandle: edge.from.port,
        target: edge.to.nodeId,
        targetHandle: edge.to.port,
    };
}

function findParentGroup(
    parentGroupId: string | undefined,
    groupsById: GroupsById,
): FlowGroup | undefined {
    return parentGroupId === undefined ? undefined : groupsById.get(parentGroupId);
}

function relativeToParent(position: Position, parent: FlowGroup | undefined): Position {
    if (!parent) {
        return position;
    }

    return { x: position.x - parent.position.x, y: position.y - parent.position.y };
}

function placeFlowNode(node: FlowNode, rfNode: RFNode, nodesById: RFNodesById): FlowNode {
    return {
        ...node,
        parentGroupId: rfNode.parentId,
        position: toAbsolutePosition(rfNode, nodesById),
    };
}

function placeFlowGroup(group: FlowGroup, rfNode: RFNode, nodesById: RFNodesById): FlowGroup {
    return {
        ...group,
        parentGroupId: rfNode.parentId,
        position: toAbsolutePosition(rfNode, nodesById),
        size: {
            width: rfNode.width ?? group.size.width,
            height: rfNode.height ?? group.size.height,
        },
    };
}

function toAbsolutePosition(rfNode: RFNode, nodesById: RFNodesById): Position {
    const parent = rfNode.parentId === undefined ? undefined : nodesById.get(rfNode.parentId);
    if (!parent) {
        return rfNode.position;
    }

    const parentPosition = toAbsolutePosition(parent, nodesById);
    return { x: rfNode.position.x + parentPosition.x, y: rfNode.position.y + parentPosition.y };
}

function toFlowEdges(edge: RFEdge): FlowEdge[] {
    const ports = toConnectionPorts(edge);
    if (!ports) {
        return [];
    }

    return [{ id: edge.id, ...ports }];
}
