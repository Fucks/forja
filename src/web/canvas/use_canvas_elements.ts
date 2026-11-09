import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import type {
    Dimensions,
    EdgeChange,
    NodeChange,
    OnEdgesChange,
    OnNodesChange,
} from "@xyflow/react";
import { useMemo, useState } from "react";

import type { FlowGraph } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { fromReactFlow, toReactFlow } from "@/web/canvas/graph_mapping.js";
import type { RFEdge, RFNode } from "@/web/canvas/graph_mapping.js";

type MeasuredSizes = Record<string, Dimensions>;

export interface CanvasElements {
    nodes: RFNode[];
    edges: RFEdge[];
    onNodesChange: OnNodesChange<RFNode>;
    onEdgesChange: OnEdgesChange<RFEdge>;
}

// React Flow hides a node until its measured size is on it, so the sizes it reports are kept here,
// apart from the graph.
export function useCanvasElements(store: EditorStore): CanvasElements {
    const graph = store((state) => state.graph);
    const selection = store((state) => state.selection);
    const [measuredSizes, setMeasuredSizes] = useState<MeasuredSizes>({});
    const { nodes, edges } = useMemo(
        () => buildCanvasElements({ graph, selection, measuredSizes }),
        [graph, selection, measuredSizes],
    );

    function onNodesChange(changes: NodeChange<RFNode>[]): void {
        setMeasuredSizes((sizes) => withMeasuredSizes(sizes, changes));
        const changedNodes = applyNodeChanges(changes, nodes);
        if (changes.some(isMove)) {
            store.getState().applyGraph((current) => fromReactFlow(changedNodes, edges, current));
        }
        if (changes.some(isSelectionChange)) {
            store.getState().select(listSelectedIds(changedNodes, edges));
        }
    }

    function onEdgesChange(changes: EdgeChange<RFEdge>[]): void {
        if (!changes.some(isSelectionChange)) {
            return;
        }

        store.getState().select(listSelectedIds(nodes, applyEdgeChanges(changes, edges)));
    }

    return { nodes, edges, onNodesChange, onEdgesChange };
}

function buildCanvasElements({
    graph,
    selection,
    measuredSizes,
}: {
    graph: FlowGraph;
    selection: string[];
    measuredSizes: MeasuredSizes;
}): { nodes: RFNode[]; edges: RFEdge[] } {
    const { nodes, edges } = toReactFlow(graph);
    const selectedIds = new Set(selection);

    return {
        nodes: nodes.map((node) => ({
            ...node,
            measured: measuredSizes[node.id],
            selected: selectedIds.has(node.id),
        })),
        edges: edges.map((edge) => ({ ...edge, selected: selectedIds.has(edge.id) })),
    };
}

function withMeasuredSizes(sizes: MeasuredSizes, changes: NodeChange<RFNode>[]): MeasuredSizes {
    const measurements = changes.flatMap((change) => {
        if (change.type !== "dimensions" || !change.dimensions) {
            return [];
        }

        return [[change.id, change.dimensions] as const];
    });
    if (measurements.length === 0) {
        return sizes;
    }

    return { ...sizes, ...Object.fromEntries(measurements) };
}

function isMove(change: NodeChange<RFNode>): boolean {
    return change.type === "position" && change.position !== undefined;
}

function isSelectionChange(change: NodeChange<RFNode> | EdgeChange<RFEdge>): boolean {
    return change.type === "select";
}

function listSelectedIds(nodes: RFNode[], edges: RFEdge[]): string[] {
    return [...nodes, ...edges].filter((element) => element.selected).map((element) => element.id);
}
