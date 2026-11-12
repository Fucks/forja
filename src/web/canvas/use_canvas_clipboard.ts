import { useStoreApi } from "@xyflow/react";
import { useEffect, useEffectEvent, useRef } from "react";

import { newId } from "@/lib/ids.js";
import type { Position } from "@/shared/flow_graph.js";
import {
    containsTrigger,
    copySelection,
    findTopLeftCorner,
    isEmptyFragment,
    parseFlowFragment,
    pasteFragment,
} from "@/web/canvas/clipboard.js";
import type { FlowFragment } from "@/web/canvas/clipboard.js";
import type { EditorState, EditorStore } from "@/web/canvas/editor_store.js";
import { findViewportCenter } from "@/web/canvas/palette/use_add_node.js";
import { isTypingTarget } from "@/web/canvas/shortcuts.js";
import { useToast } from "@/web/components/ui/toast.js";

export const DUPLICATE_OFFSET_PX = 40;

export const TRIGGER_NOT_PASTED_NOTICE = {
    title: "O trigger não foi colado",
    description: "Um fluxo tem um único trigger.",
};

// Written in both formats so pasting into another flow, or into a text editor, keeps the JSON.
const FRAGMENT_FORMATS = ["application/json", "text/plain"];

export interface CanvasClipboard {
    duplicateSelection: () => void;
}

// The browser's copy and paste events reach the system clipboard without a permission prompt.
export function useCanvasClipboard(store: EditorStore): CanvasClipboard {
    const reactFlowStore = useStoreApi();
    const toast = useToast();
    const lastCopiedFragment = useRef<FlowFragment | undefined>(undefined);

    function pasteWithNotice(fragment: FlowFragment, at: Position): void {
        if (containsTrigger(fragment)) {
            toast.show(TRIGGER_NOT_PASTED_NOTICE);
        }
        pasteIntoEditor(store.getState(), fragment, at);
    }

    function duplicateSelection(): void {
        const fragment = copySelectedElements(store.getState());
        if (!fragment) {
            return;
        }

        pasteWithNotice(fragment, offsetDiagonally(findTopLeftCorner(fragment)));
    }

    const onCopy = useEffectEvent((event: ClipboardEvent) => {
        if (!event.clipboardData || isTypingTarget(event.target) || hasSelectedText()) {
            return;
        }

        const fragment = copySelectedElements(store.getState());
        if (!fragment) {
            return;
        }

        event.preventDefault();
        writeFragment(event.clipboardData, fragment);
        lastCopiedFragment.current = fragment;
    });

    const onPaste = useEffectEvent((event: ClipboardEvent) => {
        if (isTypingTarget(event.target)) {
            return;
        }

        const fragment = readFragment(event.clipboardData) ?? lastCopiedFragment.current;
        if (!fragment) {
            return;
        }

        event.preventDefault();
        pasteWithNotice(fragment, findViewportCenter(reactFlowStore.getState()));
    });

    useEffect(() => {
        document.addEventListener("copy", onCopy);
        document.addEventListener("paste", onPaste);

        return () => {
            document.removeEventListener("copy", onCopy);
            document.removeEventListener("paste", onPaste);
        };
    }, []);

    return { duplicateSelection };
}

function copySelectedElements({ graph, selection }: EditorState): FlowFragment | undefined {
    const fragment = copySelection(graph, selection);

    return isEmptyFragment(fragment) ? undefined : fragment;
}

function pasteIntoEditor(editor: EditorState, fragment: FlowFragment, at: Position): void {
    const pasted = pasteFragment(editor.graph, fragment, at, () => newId("nod"));
    if (pasted.pastedIds.length === 0) {
        return;
    }

    editor.applyGraph(() => pasted.graph);
    editor.select(pasted.pastedIds);
}

function offsetDiagonally(position: Position): Position {
    return { x: position.x + DUPLICATE_OFFSET_PX, y: position.y + DUPLICATE_OFFSET_PX };
}

// Text selected on the page (a log, a label) is copied as text, not as the canvas selection.
function hasSelectedText(): boolean {
    return (window.getSelection()?.toString() ?? "") !== "";
}

function writeFragment(clipboard: DataTransfer, fragment: FlowFragment): void {
    const json = JSON.stringify(fragment);
    for (const format of FRAGMENT_FORMATS) {
        clipboard.setData(format, json);
    }
}

function readFragment(clipboard: DataTransfer | null): FlowFragment | undefined {
    for (const format of FRAGMENT_FORMATS) {
        const fragment = parseFlowFragment(clipboard?.getData(format) ?? "");
        if (fragment) {
            return fragment;
        }
    }

    return undefined;
}
