import type { DragEvent } from "react";

import { NODE_TYPES } from "@/shared/flow_graph.js";
import type { NodeType } from "@/shared/flow_graph.js";

export const NODE_TYPE_DRAG_FORMAT = "application/forja-node-type";

export function startDraggingNodeType(event: DragEvent, type: NodeType): void {
    event.dataTransfer.setData(NODE_TYPE_DRAG_FORMAT, type);
    event.dataTransfer.effectAllowed = "copy";
}

export function isDraggingNodeType(event: DragEvent): boolean {
    return event.dataTransfer.types.includes(NODE_TYPE_DRAG_FORMAT);
}

export function readDraggedNodeType(event: DragEvent): NodeType | undefined {
    const draggedType = event.dataTransfer.getData(NODE_TYPE_DRAG_FORMAT);

    return NODE_TYPES.find((type) => type === draggedType);
}
