import type { JSX } from "react";

import { PageTitle } from "@/web/app/page_title.js";
import type { SaveState } from "@/web/canvas/editor_store.js";

const UNTITLED_FLOW_TITLE = "Editor de fluxo";
const UNSAVED_CHANGES_LABEL = "Alterações não salvas";

const SAVE_STATE_LABELS: Record<SaveState, string> = {
    idle: "Salvo",
    saving: "Salvando…",
    saved: "Salvo",
    conflict: "Conflito",
    error: "Erro ao salvar",
};

export function EditorTopBar({
    flowName,
    saveState,
    dirty,
}: {
    flowName?: string;
    saveState: SaveState;
    dirty: boolean;
}): JSX.Element {
    return (
        <header className="flex items-baseline justify-between gap-4">
            <PageTitle>{flowName ?? UNTITLED_FLOW_TITLE}</PageTitle>
            <span role="status" className="text-xs text-muted">
                {describeSaveState(saveState, dirty)}
            </span>
        </header>
    );
}

function describeSaveState(saveState: SaveState, dirty: boolean): string {
    const isWaitingToSave = dirty && (saveState === "idle" || saveState === "saved");
    if (isWaitingToSave) {
        return UNSAVED_CHANGES_LABEL;
    }

    return SAVE_STATE_LABELS[saveState];
}
