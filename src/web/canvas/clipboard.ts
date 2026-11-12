import { enclosingGroups, groupAncestors } from "@/engine/graph_queries.js";
import type { z } from "zod";

import { flowGraphSchema } from "@/shared/flow_graph.js";
import type { FlowGraph, Position } from "@/shared/flow_graph.js";

export const flowFragmentSchema = flowGraphSchema.pick({ nodes: true, edges: true, groups: true });
export type FlowFragment = z.infer<typeof flowFragmentSchema>;

export interface PastedFragment {
    graph: FlowGraph;
    pastedIds: string[];
}

interface IdTranslation {
    copyOf(originalId: string): string;
    copyOfParent(originalParentId: string | undefined): string | undefined;
}

export function copySelection(graph: FlowGraph, ids: string[]): FlowFragment {
    const selectedIds = new Set(ids);
    const isSelected = ({ id }: { id: string }): boolean => selectedIds.has(id);
    const groups = graph.groups.filter(
        (group) => isSelected(group) || groupAncestors(graph, group.id).some(isSelected),
    );
    const nodes = graph.nodes.filter(
        (node) => isSelected(node) || enclosingGroups(graph, node.id).some(isSelected),
    );
    const copiedIds = new Set([...groups, ...nodes].map((element) => element.id));
    const edges = graph.edges.filter(
        (edge) => copiedIds.has(edge.from.nodeId) && copiedIds.has(edge.to.nodeId),
    );

    return { nodes, edges, groups };
}

export function pasteFragment(
    graph: FlowGraph,
    fragment: FlowFragment,
    at: Position,
    newId: () => string,
): PastedFragment {
    const pastable = withoutTriggers(fragment);
    if (pastable.nodes.length === 0 && pastable.groups.length === 0) {
        return { graph, pastedIds: [] };
    }

    const copies = copyWithNewIds(pastable, newId);
    const placed = moveTopLeftCornerTo(copies, at);

    return {
        graph: {
            ...graph,
            nodes: [...graph.nodes, ...placed.nodes],
            edges: [...graph.edges, ...placed.edges],
            groups: [...graph.groups, ...placed.groups],
        },
        pastedIds: [...placed.groups, ...placed.nodes].map((element) => element.id),
    };
}

// A flow has exactly one trigger, so pasting never brings another one.
export function containsTrigger(fragment: FlowFragment): boolean {
    return fragment.nodes.some((node) => node.type === "trigger");
}

/** Reads a fragment copied from this or another flow; any other clipboard text gives nothing. */
export function parseFlowFragment(text: string): FlowFragment | undefined {
    const parsed = flowFragmentSchema.safeParse(parseJson(text));

    return parsed.success ? parsed.data : undefined;
}

function withoutTriggers(fragment: FlowFragment): FlowFragment {
    const nodes = fragment.nodes.filter((node) => node.type !== "trigger");
    const remainingIds = new Set([...nodes, ...fragment.groups].map((element) => element.id));
    const edges = fragment.edges.filter(
        (edge) => remainingIds.has(edge.from.nodeId) && remainingIds.has(edge.to.nodeId),
    );

    return { nodes, edges, groups: fragment.groups };
}

function copyWithNewIds(fragment: FlowFragment, newId: () => string): FlowFragment {
    const translation = createIdTranslation([...fragment.groups, ...fragment.nodes], newId);

    return {
        groups: fragment.groups.map((group) => ({
            ...group,
            id: translation.copyOf(group.id),
            parentGroupId: translation.copyOfParent(group.parentGroupId),
        })),
        nodes: fragment.nodes.map((node) => ({
            ...node,
            id: translation.copyOf(node.id),
            parentGroupId: translation.copyOfParent(node.parentGroupId),
        })),
        edges: fragment.edges.map((edge) => ({
            id: newId(),
            from: { ...edge.from, nodeId: translation.copyOf(edge.from.nodeId) },
            to: { ...edge.to, nodeId: translation.copyOf(edge.to.nodeId) },
        })),
    };
}

function createIdTranslation(originals: { id: string }[], newId: () => string): IdTranslation {
    const copyIds = new Map(originals.map((original) => [original.id, newId()]));

    return {
        copyOf(originalId) {
            const copyId = copyIds.get(originalId);
            if (copyId === undefined) {
                throw new Error(`The fragment has no element ${originalId}`);
            }

            return copyId;
        },
        // A parent left out of the fragment stays behind, so its children land at the top level.
        copyOfParent: (originalParentId) =>
            originalParentId === undefined ? undefined : copyIds.get(originalParentId),
    };
}

function moveTopLeftCornerTo(fragment: FlowFragment, at: Position): FlowFragment {
    const corner = findTopLeftCorner(fragment);
    const shift = (position: Position): Position => ({
        x: position.x - corner.x + at.x,
        y: position.y - corner.y + at.y,
    });

    return {
        ...fragment,
        nodes: fragment.nodes.map((node) => ({ ...node, position: shift(node.position) })),
        groups: fragment.groups.map((group) => ({ ...group, position: shift(group.position) })),
    };
}

function findTopLeftCorner(fragment: FlowFragment): Position {
    const positions = [...fragment.nodes, ...fragment.groups].map((element) => element.position);

    return {
        x: Math.min(...positions.map((position) => position.x)),
        y: Math.min(...positions.map((position) => position.y)),
    };
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}
