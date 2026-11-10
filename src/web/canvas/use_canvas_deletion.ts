import type { OnEdgesDelete, OnNodesDelete } from "@xyflow/react";

import type { FlowGraph } from "@/shared/flow_graph.js";
import { removeEdges, removeNodes } from "@/web/canvas/edge_actions.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import type { RFEdge, RFNode } from "@/web/canvas/graph_mapping.js";

export interface CanvasDeletion {
    onNodesDelete: OnNodesDelete<RFNode>;
    onEdgesDelete: OnEdgesDelete<RFEdge>;
}

export function useCanvasDeletion(store: EditorStore): CanvasDeletion {
    function removeFromGraph(
        ids: string[],
        remove: (graph: FlowGraph, ids: string[]) => FlowGraph,
    ): void {
        const removedIds = new Set(ids);
        const editor = store.getState();
        editor.applyGraph((graph) => remove(graph, ids));
        editor.select(editor.selection.filter((id) => !removedIds.has(id)));
    }

    return {
        onNodesDelete: (nodes) => removeFromGraph(listIds(nodes), removeNodes),
        onEdgesDelete: (edges) => removeFromGraph(listIds(edges), removeEdges),
    };
}

function listIds(elements: { id: string }[]): string[] {
    return elements.map((element) => element.id);
}
