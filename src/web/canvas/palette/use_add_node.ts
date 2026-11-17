import { useStoreApi } from "@xyflow/react";
import type { Transform } from "@xyflow/react";

import { newId } from "@/lib/ids.js";
import type { NodeType, Position } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { createEmptyGroup } from "@/web/canvas/grouping.js";
import type { GroupKind } from "@/web/canvas/grouping.js";
import { addNodeAt } from "@/web/canvas/palette/drop_target.js";
import { tryGroupingSelection } from "@/web/canvas/use_selection_grouping.js";

export interface NodeAdder {
    addNodeAtPoint: (type: NodeType, point: Position) => void;
    addNodeAtViewportCenter: (type: NodeType) => void;
    addGroupAtPoint: (kind: GroupKind, point: Position) => void;
    addGroupAtViewportCenter: (kind: GroupKind) => void;
}

export function useAddNode(store: EditorStore): NodeAdder {
    const reactFlowStore = useStoreApi();

    function addNodeAtPoint(type: NodeType, point: Position): void {
        const nodeId = newId("nod");
        store.getState().applyGraph((graph) => addNodeAt(graph, type, point, () => nodeId));
        store.getState().select([nodeId]);
    }

    function addNodeAtViewportCenter(type: NodeType): void {
        addNodeAtPoint(type, findViewportCenter(reactFlowStore.getState()));
    }

    function addGroupAtPoint(kind: GroupKind, point: Position): void {
        const groupId = newId("grp");
        store
            .getState()
            .applyGraph((graph) => createEmptyGroup(graph, kind, point, () => groupId).graph);
        store.getState().select([groupId]);
    }

    // With nodes selected, the new group wraps them, as the selection toolbar does.
    function addGroupAtViewportCenter(kind: GroupKind): void {
        if (tryGroupingSelection(store, kind)) {
            return;
        }

        addGroupAtPoint(kind, findViewportCenter(reactFlowStore.getState()));
    }

    return { addNodeAtPoint, addNodeAtViewportCenter, addGroupAtPoint, addGroupAtViewportCenter };
}

export function findViewportCenter({
    width,
    height,
    transform: [panX, panY, zoom],
}: {
    width: number;
    height: number;
    transform: Transform;
}): Position {
    return { x: (width / 2 - panX) / zoom, y: (height / 2 - panY) / zoom };
}
