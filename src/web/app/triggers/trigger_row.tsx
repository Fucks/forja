import { History, Pencil, Play, Trash2 } from "lucide-react";
import type { JSX } from "react";

import { formatDateTime } from "@/lib/format.js";
import type { ListedTrigger } from "@/shared/trigger_types.js";
import { FireOutcome } from "@/web/app/triggers/trigger_history.js";
import { TRIGGER_KIND_STYLES, TRIGGER_POLICY_LABELS } from "@/web/app/triggers/trigger_labels.js";
import {
    useFireTrigger,
    useTriggerHistory,
    useUpdateTrigger,
} from "@/web/app/triggers/use_triggers.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Switch } from "@/web/components/ui/switch.js";
import { useToast } from "@/web/components/ui/toast.js";

export interface TriggerActions {
    onEdit: (trigger: ListedTrigger) => void;
    onShowHistory: (trigger: ListedTrigger) => void;
    onRemove: (trigger: ListedTrigger) => void;
}

const LAST_FIRE_LIMIT = 1;
const NO_NEXT_FIRE = "—";

export function TriggerRow({
    trigger,
    flowName,
    actions,
}: {
    trigger: ListedTrigger;
    flowName: string;
    actions: TriggerActions;
}): JSX.Element {
    const { label: kindLabel, icon: KindIcon } = TRIGGER_KIND_STYLES[trigger.config.kind];

    return (
        <tr className="border-b border-border">
            <td className="py-2 pr-4 font-medium">{trigger.name}</td>
            <td className="py-2 pr-4">{flowName}</td>
            <td className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5">
                    <KindIcon aria-hidden className="size-3.5 text-muted" />
                    {kindLabel}
                </span>
            </td>
            <td className="py-2 pr-4">{TRIGGER_POLICY_LABELS[trigger.policy]}</td>
            <td className="py-2 pr-4">{describeNextFire(trigger)}</td>
            <td className="py-2 pr-4">
                <LastFire triggerId={trigger.id} />
            </td>
            <td className="py-2 pr-4">
                <EnabledSwitch trigger={trigger} />
            </td>
            <td className="py-2">
                <TriggerRowActions trigger={trigger} actions={actions} />
            </td>
        </tr>
    );
}

function LastFire({ triggerId }: { triggerId: string }): JSX.Element {
    const historyQuery = useTriggerHistory(triggerId, LAST_FIRE_LIMIT);
    const lastFire = historyQuery.data?.[0];
    if (!lastFire) {
        return <span className="text-muted">Nunca disparado</span>;
    }

    return <FireOutcome fire={lastFire} prefix={`${formatDateTime(new Date(lastFire.at))} · `} />;
}

function EnabledSwitch({ trigger }: { trigger: ListedTrigger }): JSX.Element {
    const updateTrigger = useUpdateTrigger();

    return (
        <Switch
            label="Habilitado"
            checked={trigger.enabled}
            onChange={(enabled) => updateTrigger.mutate({ id: trigger.id, changes: { enabled } })}
        />
    );
}

function TriggerRowActions({
    trigger,
    actions,
}: {
    trigger: ListedTrigger;
    actions: TriggerActions;
}): JSX.Element {
    const fireTrigger = useFireTriggerWithFeedback();

    return (
        <div className="flex justify-end gap-1">
            <IconButton
                label={`Disparar ${trigger.name} agora`}
                icon={Play}
                onClick={() => fireTrigger(trigger.id)}
            />
            <IconButton
                label={`Editar ${trigger.name}`}
                icon={Pencil}
                onClick={() => actions.onEdit(trigger)}
            />
            <IconButton
                label={`Histórico de ${trigger.name}`}
                icon={History}
                onClick={() => actions.onShowHistory(trigger)}
            />
            <IconButton
                label={`Remover ${trigger.name}`}
                icon={Trash2}
                onClick={() => actions.onRemove(trigger)}
            />
        </div>
    );
}

function useFireTriggerWithFeedback(): (triggerId: string) => void {
    const fireTrigger = useFireTrigger();
    const toast = useToast();

    return (triggerId) =>
        fireTrigger.mutate(
            { triggerId },
            {
                onError: (error) =>
                    toast.show({
                        title: "Não foi possível disparar",
                        description: error.message,
                        tone: "error",
                    }),
            },
        );
}

function describeNextFire(trigger: ListedTrigger): string {
    const { cronDescription, nextFireAt } = trigger;
    if (!cronDescription) {
        return NO_NEXT_FIRE;
    }
    if (!nextFireAt) {
        return cronDescription;
    }

    return `${cronDescription} · ${formatDateTime(new Date(nextFireAt))}`;
}
