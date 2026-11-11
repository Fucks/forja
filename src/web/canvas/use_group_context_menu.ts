import { useState } from "react";
import type { MouseEvent } from "react";

import type { Position } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { GROUP_NODE_TYPE } from "@/web/canvas/graph_mapping.js";
import type { RFNode } from "@/web/canvas/graph_mapping.js";
import { fitGroupToChildren, ungroup } from "@/web/canvas/grouping.js";

export interface OpenGroupMenu {
    groupId: string;
    screenPosition: Position;
}

export interface GroupContextMenuControls {
    openMenu: OpenGroupMenu | undefined;
    onNodeContextMenu: (event: MouseEvent, node: RFNode) => void;
    closeMenu: () => void;
    ungroupMenuGroup: () => void;
    fitMenuGroup: () => void;
}

export function useGroupContextMenu(store: EditorStore): GroupContextMenuControls {
    const [openMenu, setOpenMenu] = useState<OpenGroupMenu>();

    function onNodeContextMenu(event: MouseEvent, node: RFNode): void {
        if (node.type !== GROUP_NODE_TYPE) {
            return;
        }

        event.preventDefault();
        setOpenMenu({ groupId: node.id, screenPosition: { x: event.clientX, y: event.clientY } });
    }

    function closeMenu(): void {
        setOpenMenu(undefined);
    }

    function ungroupMenuGroup(): void {
        if (!openMenu) {
            return;
        }

        const editor = store.getState();
        editor.applyGraph((graph) => ungroup(graph, openMenu.groupId));
        editor.select(editor.selection.filter((id) => id !== openMenu.groupId));
        closeMenu();
    }

    function fitMenuGroup(): void {
        if (!openMenu) {
            return;
        }

        store.getState().applyGraph((graph) => fitGroupToChildren(graph, openMenu.groupId));
        closeMenu();
    }

    return { openMenu, onNodeContextMenu, closeMenu, ungroupMenuGroup, fitMenuGroup };
}
