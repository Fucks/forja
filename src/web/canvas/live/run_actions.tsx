import { Ban, Pause, Play, Wallet } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import { RUN_TERMINAL } from "@/engine/run_state.js";
import type { SerializedRunRecord } from "@/shared/run_types.js";
import { CancelRunDialog } from "@/web/canvas/live/cancel_run_dialog.js";
import { RaiseBudgetDialog } from "@/web/canvas/live/raise_budget_dialog.js";
import { useRunActions } from "@/web/canvas/live/use_run_actions.js";
import { Button } from "@/web/components/ui/button.js";

const ACTION_ICON_CLASSES = "size-3.5";

type OpenDialog = "none" | "cancel" | "raiseBudget";

export function RunActions({ run }: { run: SerializedRunRecord }): JSX.Element {
    const actions = useRunActions(run.id);
    const [openDialog, setOpenDialog] = useState<OpenDialog>("none");
    const closeDialog = (): void => setOpenDialog("none");
    const actionError = actions.pause.error ?? actions.resume.error;

    return (
        <div className="flex items-center gap-2">
            {actionError && (
                <p role="alert" className="text-xs text-status-failed">
                    {actionError.message}
                </p>
            )}
            {run.status === "RUNNING" && (
                <Button loading={actions.pause.isPending} onClick={() => actions.pause.mutate()}>
                    <Pause aria-hidden className={ACTION_ICON_CLASSES} />
                    Pausar
                </Button>
            )}
            {isPausedBy(run, "user") && (
                <Button loading={actions.resume.isPending} onClick={() => actions.resume.mutate()}>
                    <Play aria-hidden className={ACTION_ICON_CLASSES} />
                    Retomar
                </Button>
            )}
            {isPausedBy(run, "budget") && (
                <Button onClick={() => setOpenDialog("raiseBudget")}>
                    <Wallet aria-hidden className={ACTION_ICON_CLASSES} />
                    Aumentar orçamento
                </Button>
            )}
            {!RUN_TERMINAL.has(run.status) && (
                <Button variant="danger" onClick={() => setOpenDialog("cancel")}>
                    <Ban aria-hidden className={ACTION_ICON_CLASSES} />
                    Cancelar
                </Button>
            )}
            {openDialog === "cancel" && (
                <CancelRunDialog cancel={actions.cancel} onClose={closeDialog} />
            )}
            {openDialog === "raiseBudget" && (
                <RaiseBudgetDialog raiseBudget={actions.raiseBudget} onClose={closeDialog} />
            )}
        </div>
    );
}

// The usage limit pause ends by itself, so only the user's own pause can be resumed by hand.
function isPausedBy(
    run: SerializedRunRecord,
    reason: NonNullable<SerializedRunRecord["pauseReason"]>,
): boolean {
    return run.status === "PAUSED" && run.pauseReason === reason;
}
