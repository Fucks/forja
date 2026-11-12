import { useReactFlow } from "@xyflow/react";
import { useEffect, useEffectEvent } from "react";

import type { FlowGraph } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { findShortcutCommand, isTypingTarget } from "@/web/canvas/shortcuts.js";
import type { ShortcutCommand } from "@/web/canvas/shortcuts.js";

// Delete belongs to React Flow, G M and G L to useGroupingShortcuts, copy and paste to
// useCanvasClipboard.
export function useEditorShortcuts({
    store,
    duplicateSelection,
    openHelp,
}: {
    store: EditorStore;
    duplicateSelection: () => void;
    openHelp: () => void;
}): void {
    const { fitView } = useReactFlow();
    const runCommand: Record<ShortcutCommand, () => void> = {
        undo: () => store.getState().undo(),
        redo: () => store.getState().redo(),
        duplicate: duplicateSelection,
        selectAll: () => store.getState().select(listElementIds(store.getState().graph)),
        fitView: () => void fitView(),
        openHelp,
    };

    const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
        if (isTypingTarget(event.target)) {
            return;
        }

        const command = findShortcutCommand(event);
        if (!command) {
            return;
        }

        event.preventDefault();
        runCommand[command]();
    });

    useEffect(() => {
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, []);
}

function listElementIds(graph: FlowGraph): string[] {
    return [...graph.groups, ...graph.nodes, ...graph.edges].map((element) => element.id);
}
