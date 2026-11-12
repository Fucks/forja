import { useState } from "react";
import type { JSX } from "react";

import type { NodeRunStatusName } from "@/shared/events.js";
import type { SerializedNodeRun } from "@/shared/run_types.js";
import { useNodeRunActions } from "@/web/canvas/live/use_node_run_actions.js";
import type { NodeRunAction, NodeRunActions } from "@/web/canvas/live/use_node_run_actions.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";

type NodeRunActionName = keyof NodeRunActions;

interface NodeRunActionCopy {
    buttonLabel: string;
    title: string;
    description: string;
    confirmLabel: string;
    confirmVariant: "primary" | "danger";
}

const ACTIONS_BY_STATUS: Partial<Record<NodeRunStatusName, NodeRunActionName>> = {
    QUEUED: "cancel",
    RUNNING: "cancel",
    FAILED: "retry",
    CANCELED: "retry",
    SUCCEEDED: "retry",
};

const ACTION_COPY: Record<NodeRunActionName, NodeRunActionCopy> = {
    cancel: {
        buttonLabel: "Cancelar",
        title: "Cancelar esta execução?",
        description: "A execução é interrompida e termina como cancelada.",
        confirmLabel: "Cancelar execução",
        confirmVariant: "danger",
    },
    retry: {
        buttonLabel: "Repetir",
        title: "Repetir esta execução?",
        description:
            "Uma nova tentativa entra na fila com as mesmas entradas. Uma run já terminada volta a rodar.",
        confirmLabel: "Repetir execução",
        confirmVariant: "primary",
    },
};

export function NodeRunActionButtons({
    nodeRun,
}: {
    nodeRun: SerializedNodeRun;
}): JSX.Element | null {
    const actions = useNodeRunActions(nodeRun);
    const [isConfirming, setIsConfirming] = useState(false);
    const actionName = ACTIONS_BY_STATUS[nodeRun.status];
    if (actionName === undefined) {
        return null;
    }

    const copy = ACTION_COPY[actionName];
    return (
        <>
            <Button size="sm" onClick={() => setIsConfirming(true)}>
                {copy.buttonLabel}
            </Button>
            {isConfirming && (
                <ConfirmNodeRunActionDialog
                    action={actions[actionName]}
                    copy={copy}
                    onClose={() => setIsConfirming(false)}
                />
            )}
        </>
    );
}

function ConfirmNodeRunActionDialog({
    action,
    copy,
    onClose,
}: {
    action: NodeRunAction;
    copy: NodeRunActionCopy;
    onClose: () => void;
}): JSX.Element {
    return (
        <Dialog open onOpenChange={onClose} title={copy.title} description={copy.description}>
            {action.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {action.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onClose}>Voltar</Button>
                <Button
                    variant={copy.confirmVariant}
                    loading={action.isPending}
                    onClick={() => action.mutate(undefined, { onSuccess: onClose })}
                >
                    {copy.confirmLabel}
                </Button>
            </footer>
        </Dialog>
    );
}
