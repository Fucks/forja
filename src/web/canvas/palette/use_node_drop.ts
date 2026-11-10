import { useReactFlow } from "@xyflow/react";
import { useState } from "react";
import type { DragEvent } from "react";

import type { Position } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { findDropGroup } from "@/web/canvas/palette/drop_target.js";
import { isDraggingNodeType, readDraggedNodeType } from "@/web/canvas/palette/node_type_drag.js";
import { useAddNode } from "@/web/canvas/palette/use_add_node.js";

export interface NodeDrop {
    dropTargetGroupId: string | undefined;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
}

export function useNodeDrop(store: EditorStore): NodeDrop {
    const { screenToFlowPosition } = useReactFlow();
    const { addNodeAtPoint } = useAddNode(store);
    const [dropTargetGroupId, setDropTargetGroupId] = useState<string | undefined>();

    function toFlowPoint(event: DragEvent): Position {
        return screenToFlowPosition({ x: event.clientX, y: event.clientY });
    }

    function onDragOver(event: DragEvent): void {
        if (!isDraggingNodeType(event)) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropTargetGroupId(findDropGroup(store.getState().graph, toFlowPoint(event)));
    }

    function onDragLeave(event: DragEvent): void {
        if (isMovingWithin(event)) {
            return;
        }

        setDropTargetGroupId(undefined);
    }

    function onDrop(event: DragEvent): void {
        setDropTargetGroupId(undefined);
        const type = readDraggedNodeType(event);
        if (!type) {
            return;
        }

        event.preventDefault();
        addNodeAtPoint(type, toFlowPoint(event));
    }

    return { dropTargetGroupId, onDragOver, onDragLeave, onDrop };
}

// The canvas also gets a dragleave when the cursor only moves onto one of its own children.
function isMovingWithin(event: DragEvent): boolean {
    const { currentTarget, relatedTarget } = event;

    return relatedTarget instanceof Node && currentTarget.contains(relatedTarget);
}
