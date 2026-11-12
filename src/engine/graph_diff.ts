import { listFieldChanges } from "@/engine/field_changes.js";
import type { FieldChange } from "@/engine/field_changes.js";
import type { FlowEdge, FlowGraph, FlowGroup, FlowNode } from "@/shared/flow_graph.js";

export type { FieldChange } from "@/engine/field_changes.js";

export interface FlowGraphDiff {
    addedNodes: FlowNode[];
    removedNodes: FlowNode[];
    changedNodes: { nodeId: string; label: string; changes: FieldChange[] }[];
    addedEdges: FlowEdge[];
    removedEdges: FlowEdge[];
    addedGroups: FlowGroup[];
    removedGroups: FlowGroup[];
    changedGroups: { groupId: string; changes: FieldChange[] }[];
}

// Moving or resizing on the canvas changes nothing about what the flow does.
const NODE_LAYOUT_FIELDS = ["position"];
const GROUP_LAYOUT_FIELDS = ["position", "size"];

interface KeptPair<Element> {
    before: Element;
    after: Element;
}

interface MatchedElements<Element> {
    added: Element[];
    removed: Element[];
    kept: KeptPair<Element>[];
}

export function diffFlowGraphs(before: FlowGraph, after: FlowGraph): FlowGraphDiff {
    const nodes = matchElements(before.nodes, after.nodes, (node) => node.id);
    const edges = matchElements(before.edges, after.edges, describeConnection);
    const groups = matchElements(before.groups, after.groups, (group) => group.id);

    return {
        addedNodes: nodes.added,
        removedNodes: nodes.removed,
        changedNodes: listChangedNodes(nodes.kept),
        addedEdges: edges.added,
        removedEdges: edges.removed,
        addedGroups: groups.added,
        removedGroups: groups.removed,
        changedGroups: listChangedGroups(groups.kept),
    };
}

function matchElements<Element>(
    before: Element[],
    after: Element[],
    identify: (element: Element) => string,
): MatchedElements<Element> {
    const beforeById = new Map(before.map((element) => [identify(element), element]));
    const afterIds = new Set(after.map(identify));

    return {
        added: after.filter((element) => !beforeById.has(identify(element))),
        removed: before.filter((element) => !afterIds.has(identify(element))),
        kept: pairKeptElements(beforeById, after, identify),
    };
}

function pairKeptElements<Element>(
    beforeById: Map<string, Element>,
    after: Element[],
    identify: (element: Element) => string,
): KeptPair<Element>[] {
    const pairs: KeptPair<Element>[] = [];
    for (const afterElement of after) {
        const beforeElement = beforeById.get(identify(afterElement));
        if (beforeElement !== undefined) {
            pairs.push({ before: beforeElement, after: afterElement });
        }
    }

    return pairs;
}

// Edges are told apart by what they connect: an edge re-created with a new id is the same edge.
function describeConnection(edge: FlowEdge): string {
    return `${edge.from.nodeId}.${edge.from.port}->${edge.to.nodeId}.${edge.to.port}`;
}

function listChangedNodes(keptNodes: KeptPair<FlowNode>[]): FlowGraphDiff["changedNodes"] {
    return keptNodes
        .map(({ before, after }) => ({
            nodeId: after.id,
            label: after.label,
            changes: listFieldChanges(before, after, { ignoredFields: NODE_LAYOUT_FIELDS }),
        }))
        .filter(hasChanges);
}

function listChangedGroups(keptGroups: KeptPair<FlowGroup>[]): FlowGraphDiff["changedGroups"] {
    return keptGroups
        .map(({ before, after }) => ({
            groupId: after.id,
            changes: listFieldChanges(before, after, { ignoredFields: GROUP_LAYOUT_FIELDS }),
        }))
        .filter(hasChanges);
}

function hasChanges(element: { changes: FieldChange[] }): boolean {
    return element.changes.length > 0;
}
