import { findGroup, findNode, groupMembers } from "@/engine/graph_queries.js";
import type { Condition } from "@/shared/conditions.js";
import { loopConfigSchema, mapConfigSchema } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowGroup, FlowNode, Position } from "@/shared/flow_graph.js";
import { boundingFrame, frameAround, nodeFrame } from "@/web/canvas/group_frame_geometry.js";
import type { Frame } from "@/web/canvas/group_frame_geometry.js";
import { findDropGroup } from "@/web/canvas/palette/drop_target.js";

export type GroupingVerdict = { ok: true } | { ok: false; reason: string };
export type GroupKind = FlowGroup["kind"];

type GroupMember = { parentGroupId?: string };

export const EMPTY_SELECTION_REASON = "Selecione ao menos um nó";
export const MIXED_GROUPS_REASON = "Os nós precisam estar no mesmo grupo";
export const TRIGGER_INSIDE_GROUP_REASON = "O trigger não pode ficar dentro de um grupo";

// An empty path never matches, so validation reports the loop until the user defines its exit.
const UNDEFINED_LOOP_CONDITION: Condition = { op: "exists", path: "" };

export const GROUP_KIND_LABELS: Record<GroupKind, string> = { map: "Map", loop: "Loop" };

export class GroupingRejectedError extends Error {
    constructor(readonly reason: string) {
        super(reason);
        this.name = "GroupingRejectedError";
    }
}

export function canGroup(graph: FlowGraph, nodeIds: string[]): GroupingVerdict {
    const nodes = findNodes(graph, nodeIds);
    if (nodes.length === 0) {
        return { ok: false, reason: EMPTY_SELECTION_REASON };
    }
    if (nodes.some((node) => node.type === "trigger")) {
        return { ok: false, reason: TRIGGER_INSIDE_GROUP_REASON };
    }
    if (new Set(nodes.map((node) => node.parentGroupId)).size > 1) {
        return { ok: false, reason: MIXED_GROUPS_REASON };
    }

    return { ok: true };
}

export function groupNodes(
    graph: FlowGraph,
    nodeIds: string[],
    kind: GroupKind,
    newId: () => string,
): { graph: FlowGraph; groupId: string } {
    const verdict = canGroup(graph, nodeIds);
    if (!verdict.ok) {
        throw new GroupingRejectedError(verdict.reason);
    }

    const members = findNodes(graph, nodeIds);
    const group = createGroup({
        id: newId(),
        kind,
        parentGroupId: members[0]?.parentGroupId,
        frame: frameAround(members.map(nodeFrame)),
    });
    const withGroup = addGroupHolding(graph, group, members);

    return { graph: growAncestorsToContain(withGroup, group.id), groupId: group.id };
}

export function ungroup(graph: FlowGraph, groupId: string): FlowGraph {
    const group = findGroup(graph, groupId);
    if (!group) {
        return graph;
    }

    return {
        ...graph,
        nodes: graph.nodes.map((node) => liftOutOf(group, node)),
        groups: graph.groups
            .filter((other) => other.id !== groupId)
            .map((other) => liftOutOf(group, other)),
        edges: graph.edges.filter(
            (edge) => edge.from.nodeId !== groupId && edge.to.nodeId !== groupId,
        ),
    };
}

export function reparentNode(graph: FlowGraph, nodeId: string, point: Position): FlowGraph {
    const node = findNode(graph, nodeId);
    if (!node || node.type === "trigger") {
        return graph;
    }

    const parentGroupId = findDropGroup(graph, point);
    if (parentGroupId === node.parentGroupId) {
        return graph;
    }

    return replaceNode(graph, { ...node, parentGroupId });
}

export function fitGroupToChildren(graph: FlowGraph, groupId: string): FlowGraph {
    const group = findGroup(graph, groupId);
    const childFrames = listChildFrames(graph, groupId);
    if (!group || childFrames.length === 0) {
        return graph;
    }

    const fitted = replaceGroup(graph, { ...group, ...frameAround(childFrames) });
    return growAncestorsToContain(fitted, groupId);
}

function findNodes(graph: FlowGraph, nodeIds: string[]): FlowNode[] {
    return nodeIds.flatMap((nodeId) => findNode(graph, nodeId) ?? []);
}

function createGroup({
    id,
    kind,
    parentGroupId,
    frame,
}: {
    id: string;
    kind: GroupKind;
    parentGroupId: string | undefined;
    frame: Frame;
}): FlowGroup {
    const fields = { id, label: GROUP_KIND_LABELS[kind], parentGroupId, ...frame };
    if (kind === "map") {
        return { ...fields, kind, config: mapConfigSchema.parse({}) };
    }

    return { ...fields, kind, config: loopConfigSchema.parse({ until: UNDEFINED_LOOP_CONDITION }) };
}

function addGroupHolding(graph: FlowGraph, group: FlowGroup, members: FlowNode[]): FlowGraph {
    const memberIds = new Set(members.map((node) => node.id));

    return {
        ...graph,
        nodes: graph.nodes.map((node) =>
            memberIds.has(node.id) ? { ...node, parentGroupId: group.id } : node,
        ),
        groups: [...graph.groups, group],
    };
}

function liftOutOf<Member extends GroupMember>(removedGroup: FlowGroup, member: Member): Member {
    if (member.parentGroupId !== removedGroup.id) {
        return member;
    }

    return { ...member, parentGroupId: removedGroup.parentGroupId };
}

function listChildFrames(graph: FlowGraph, groupId: string): Frame[] {
    const { nodeIds, childGroupIds } = groupMembers(graph, groupId);

    return [
        ...findNodes(graph, nodeIds).map(nodeFrame),
        ...childGroupIds.flatMap((childId) => findGroup(graph, childId) ?? []),
    ];
}

// Groups never overlap partially, so each enclosing group widens to hold the grown group inside it.
function growAncestorsToContain(graph: FlowGraph, groupId: string): FlowGraph {
    const group = findGroup(graph, groupId);
    const parent = findGroup(graph, group?.parentGroupId);
    if (!group || !parent) {
        return graph;
    }

    const grownParent = { ...parent, ...boundingFrame([parent, frameAround([group])]) };
    return growAncestorsToContain(replaceGroup(graph, grownParent), parent.id);
}

function replaceNode(graph: FlowGraph, replacement: FlowNode): FlowGraph {
    return {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === replacement.id ? replacement : node)),
    };
}

function replaceGroup(graph: FlowGraph, replacement: FlowGroup): FlowGraph {
    return {
        ...graph,
        groups: graph.groups.map((group) => (group.id === replacement.id ? replacement : group)),
    };
}
