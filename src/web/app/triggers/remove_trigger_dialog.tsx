import type { JSX } from "react";

import type { Trigger } from "@/shared/trigger_types.js";
import { useRemoveTrigger } from "@/web/app/triggers/use_triggers.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";

export function RemoveTriggerDialog({
    trigger,
    onClose,
}: {
    trigger: Trigger;
    onClose: () => void;
}): JSX.Element {
    const removeTrigger = useRemoveTrigger();

    const confirmRemoval = (): void => {
        removeTrigger.mutate(trigger.id, { onSuccess: onClose });
    };

    return (
        <Dialog
            open
            onOpenChange={onClose}
            title="Remover gatilho"
            description={`O gatilho ${trigger.name} e o seu histórico serão apagados. Runs já iniciadas continuam.`}
        >
            {removeTrigger.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {removeTrigger.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onClose}>Cancelar</Button>
                <Button variant="danger" loading={removeTrigger.isPending} onClick={confirmRemoval}>
                    Remover
                </Button>
            </footer>
        </Dialog>
    );
}
