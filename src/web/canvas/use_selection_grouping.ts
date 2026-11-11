import { findNode } from "@/engine/graph_queries.js";
import { newId } from "@/lib/ids.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { canGroup, groupNodes } from "@/web/canvas/grouping.js";
import type { GroupingVerdict, GroupKind } from "@/web/canvas/grouping.js";

export interface SelectionGrouping {
    hasSelectedNodes: boolean;
    verdict: GroupingVerdict;
    groupSelection: (kind: GroupKind) => void;
}

export function useSelectionGrouping(store: EditorStore): SelectionGrouping {
    const graph = store((state) => state.graph);
    const selection = store((state) => state.selection);
    const selectedNodeIds = listSelectedNodeIds(graph, selection);

    function groupSelection(kind: GroupKind): void {
        const editor = store.getState();
        const nodeIds = listSelectedNodeIds(editor.graph, editor.selection);
        if (!canGroup(editor.graph, nodeIds).ok) {
            return;
        }

        const groupId = newId("grp");
        editor.applyGraph((current) => groupNodes(current, nodeIds, kind, () => groupId).graph);
        editor.select([groupId]);
    }

    return {
        hasSelectedNodes: selectedNodeIds.length > 0,
        verdict: canGroup(graph, selectedNodeIds),
        groupSelection,
    };
}

// The selection also holds edges and groups; only nodes are grouped.
function listSelectedNodeIds(graph: FlowGraph, selection: string[]): string[] {
    return selection.filter((id) => findNode(graph, id) !== undefined);
}
