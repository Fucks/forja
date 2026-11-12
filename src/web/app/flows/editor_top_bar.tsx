import { History } from "lucide-react";
import type { JSX } from "react";
import { Link } from "react-router";

import type { FlowSummary } from "@/shared/flow_types.js";
import { ExportFlowMenu } from "@/web/app/flows/export_flow_menu.js";
import { PageTitle } from "@/web/app/page_title.js";
import type { SaveState } from "@/web/canvas/editor_store.js";
import { Button } from "@/web/components/ui/button.js";

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
    flow,
    saveState,
    dirty,
    versionsPath,
}: {
    flow: FlowSummary | undefined;
    saveState: SaveState;
    dirty: boolean;
    versionsPath: string;
}): JSX.Element {
    return (
        <header className="flex items-baseline justify-between gap-4">
            <PageTitle>{flow?.name ?? UNTITLED_FLOW_TITLE}</PageTitle>
            <div className="flex items-center gap-3">
                <span role="status" className="text-xs text-muted">
                    {describeSaveState(saveState, dirty)}
                </span>
                <Button asChild variant="ghost" size="sm">
                    <Link to={versionsPath}>
                        <History aria-hidden="true" className="size-3.5" />
                        Versões
                    </Link>
                </Button>
                {flow && <ExportFlowMenu flow={flow} />}
            </div>
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
