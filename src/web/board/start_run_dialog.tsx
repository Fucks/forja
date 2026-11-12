import type { JSX } from "react";

import type { BoardCard } from "@/shared/board_types.js";
import type { Trigger, TriggerFire, TriggerFireOutcome } from "@/shared/trigger_types.js";
import { useFlowSummary } from "@/web/app/flows/use_flow_summary.js";
import { useFireTrigger } from "@/web/app/triggers/use_triggers.js";
import { itemReference } from "@/web/board/work_item_card.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { useToast } from "@/web/components/ui/toast.js";

// A fire answers with an outcome even when no run starts, e.g. when the policy skips it.
const UNSTARTED_FIRE_TITLES: Record<Exclude<TriggerFireOutcome, "started">, string> = {
    queued: "Run enfileirada",
    skipped: "Run não iniciada",
    error: "Não foi possível iniciar a run",
};

export function StartRunDialog({
    projectId,
    card,
    trigger,
    onClose,
}: {
    projectId: string;
    card: BoardCard;
    trigger: Trigger;
    onClose: () => void;
}): JSX.Element {
    const flow = useFlowSummary(projectId, trigger.flowId);
    const flowName = flow.data?.name ?? trigger.name;
    const fireTrigger = useFireTrigger();
    const reportUnstartedFire = useUnstartedFireReport();

    const startRun = (): void =>
        fireTrigger.mutate(
            { triggerId: trigger.id, itemIds: [card.item.id] },
            {
                onSuccess: (fire) => {
                    reportUnstartedFire(fire);
                    onClose();
                },
            },
        );

    return (
        <Dialog
            open
            onOpenChange={onClose}
            title={`Iniciar '${flowName}' para ${itemReference(card.item)}?`}
        >
            {fireTrigger.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {fireTrigger.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onClose}>Cancelar</Button>
                <Button variant="primary" loading={fireTrigger.isPending} onClick={startRun}>
                    Iniciar run
                </Button>
            </footer>
        </Dialog>
    );
}

function useUnstartedFireReport(): (fire: TriggerFire) => void {
    const toast = useToast();

    return (fire) => {
        if (fire.outcome === "started") {
            return;
        }
        toast.show({
            tone: fire.outcome === "error" ? "error" : "info",
            title: UNSTARTED_FIRE_TITLES[fire.outcome],
            description: fire.message,
        });
    };
}
