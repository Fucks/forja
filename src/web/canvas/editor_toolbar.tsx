import { Keyboard, Network, Redo2, Undo2 } from "lucide-react";
import type { JSX } from "react";

import type { EditorStore } from "@/web/canvas/editor_store.js";
import { Button } from "@/web/components/ui/button.js";
import { IconButton } from "@/web/components/ui/icon_button.js";

export function EditorToolbar({
    store,
    isArranging,
    onArrange,
    onShowShortcuts,
}: {
    store: EditorStore;
    isArranging: boolean;
    onArrange: () => void;
    onShowShortcuts: () => void;
}): JSX.Element {
    const canUndo = store((state) => state.canUndo);
    const canRedo = store((state) => state.canRedo);

    return (
        <div
            role="toolbar"
            aria-label="Editor"
            className="flex gap-1 rounded-md border border-border bg-surface p-1 shadow-float"
        >
            <IconButton
                label="Desfazer"
                icon={Undo2}
                disabled={!canUndo}
                onClick={() => store.getState().undo()}
            />
            <IconButton
                label="Refazer"
                icon={Redo2}
                disabled={!canRedo}
                onClick={() => store.getState().redo()}
            />
            <Button variant="ghost" size="sm" disabled={isArranging} onClick={onArrange}>
                <Network aria-hidden className="size-4" />
                Organizar
            </Button>
            <IconButton label="Atalhos do teclado" icon={Keyboard} onClick={onShowShortcuts} />
        </div>
    );
}
