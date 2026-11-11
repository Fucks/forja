import {
    Clock,
    Hand,
    KanbanSquare,
    ListPlus,
    Play,
    SkipForward,
    Webhook,
    XOctagon,
    Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
    ItemSelection,
    TriggerEvent,
    TriggerFireOutcome,
    TriggerKind,
    TriggerPolicy,
} from "@/shared/trigger_types.js";

interface LabeledIcon {
    label: string;
    icon: LucideIcon;
}

interface FireOutcomeStyle extends LabeledIcon {
    colorClass: string;
}

export const TRIGGER_KIND_STYLES: Record<TriggerKind, LabeledIcon> = {
    manual: { label: "Manual", icon: Hand },
    schedule: { label: "Horário", icon: Clock },
    event: { label: "Evento", icon: Zap },
    webhook: { label: "Webhook", icon: Webhook },
    board_column: { label: "Coluna do board", icon: KanbanSquare },
};

export const TRIGGER_POLICY_LABELS: Record<TriggerPolicy, string> = {
    skip: "Pular",
    queue: "Enfileirar",
    parallel: "Rodar em paralelo",
};

export const FIRE_OUTCOME_STYLES: Record<TriggerFireOutcome, FireOutcomeStyle> = {
    started: { label: "Run iniciada", icon: Play, colorClass: "text-status-succeeded" },
    queued: { label: "Enfileirado", icon: ListPlus, colorClass: "text-status-queued" },
    skipped: { label: "Pulado", icon: SkipForward, colorClass: "text-status-canceled" },
    error: { label: "Erro", icon: XOctagon, colorClass: "text-status-failed" },
};

export const TRIGGER_EVENT_LABELS: Record<TriggerEvent, string> = {
    "usage.limit_reset": "Quando o limite de uso resetar",
    "run.finished": "Quando uma run terminar",
    "work_item.created": "Quando um item for criado",
};

export const ITEM_SELECTION_LABELS: Record<ItemSelection, string> = {
    source: "Buscar no source do fluxo",
    event_items: "Usar os itens do disparo",
};
