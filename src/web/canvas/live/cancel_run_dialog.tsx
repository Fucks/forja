import type { JSX } from "react";

import type { RunActions } from "@/web/canvas/live/use_run_actions.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";

export function CancelRunDialog({
    cancel,
    onClose,
}: {
    cancel: RunActions["cancel"];
    onClose: () => void;
}): JSX.Element {
    return (
        <Dialog
            open
            onOpenChange={onClose}
            title="Cancelar run"
            description="Os nós em execução são interrompidos e a run termina como cancelada."
        >
            {cancel.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {cancel.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onClose}>Voltar</Button>
                <Button
                    variant="danger"
                    loading={cancel.isPending}
                    onClick={() => cancel.mutate(undefined, { onSuccess: onClose })}
                >
                    Cancelar run
                </Button>
            </footer>
        </Dialog>
    );
}
