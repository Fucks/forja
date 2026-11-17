import type { DragEvent } from "react";

import { NODE_TYPES } from "@/shared/flow_graph.js";
import { GROUP_KINDS } from "@/web/canvas/grouping.js";
import type { PaletteItemRef } from "@/web/canvas/palette/palette_items.js";

export const NODE_TYPE_DRAG_FORMAT = "application/forja-node-type";
export const GROUP_KIND_DRAG_FORMAT = "application/forja-group-kind";

const DRAG_FORMATS: Record<PaletteItemRef["kind"], string> = {
    node: NODE_TYPE_DRAG_FORMAT,
    group: GROUP_KIND_DRAG_FORMAT,
};

export function startDraggingPaletteItem(event: DragEvent, item: PaletteItemRef): void {
    event.dataTransfer.setData(DRAG_FORMATS[item.kind], item.type);
    event.dataTransfer.effectAllowed = "copy";
}

export function isDraggingPaletteItem(event: DragEvent): boolean {
    const { types } = event.dataTransfer;

    return types.includes(NODE_TYPE_DRAG_FORMAT) || types.includes(GROUP_KIND_DRAG_FORMAT);
}

export function readDraggedPaletteItem(event: DragEvent): PaletteItemRef | undefined {
    const draggedNodeType = event.dataTransfer.getData(NODE_TYPE_DRAG_FORMAT);
    const nodeType = NODE_TYPES.find((type) => type === draggedNodeType);
    if (nodeType) {
        return { kind: "node", type: nodeType };
    }

    const draggedGroupKind = event.dataTransfer.getData(GROUP_KIND_DRAG_FORMAT);
    const groupKind = GROUP_KINDS.find((kind) => kind === draggedGroupKind);
    if (groupKind) {
        return { kind: "group", type: groupKind };
    }

    return undefined;
}
