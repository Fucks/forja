import { useStoreApi } from "@xyflow/react";
import type { Transform } from "@xyflow/react";

import { newId } from "@/lib/ids.js";
import type { NodeType, Position } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { addNodeAt } from "@/web/canvas/palette/drop_target.js";

export interface NodeAdder {
    addNodeAtPoint: (type: NodeType, point: Position) => void;
    addNodeAtViewportCenter: (type: NodeType) => void;
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

    return { addNodeAtPoint, addNodeAtViewportCenter };
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
