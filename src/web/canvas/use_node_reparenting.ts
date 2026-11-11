import { useReactFlow } from "@xyflow/react";
import type { OnNodeDrag } from "@xyflow/react";

import type { Position } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { GROUP_NODE_TYPE } from "@/web/canvas/graph_mapping.js";
import type { RFNode } from "@/web/canvas/graph_mapping.js";
import { reparentNode } from "@/web/canvas/grouping.js";

export interface NodeReparenting {
    onNodeDragStop: OnNodeDrag<RFNode>;
}

// A node joins the innermost group under the pointer where it is dropped, or leaves its group.
export function useNodeReparenting(store: EditorStore): NodeReparenting {
    const { screenToFlowPosition } = useReactFlow();

    const onNodeDragStop: OnNodeDrag<RFNode> = (event, node) => {
        const pointer = readPointer(event);
        if (node.type === GROUP_NODE_TYPE || !pointer) {
            return;
        }

        const dropPoint = screenToFlowPosition(pointer);
        store.getState().applyGraph((graph) => reparentNode(graph, node.id, dropPoint));
    };

    return { onNodeDragStop };
}

function readPointer(event: MouseEvent | TouchEvent): Position | undefined {
    if (event instanceof MouseEvent) {
        return { x: event.clientX, y: event.clientY };
    }

    const [touch] = event.changedTouches;
    return touch && { x: touch.clientX, y: touch.clientY };
}
