import {
    Ban,
    CheckCircle2,
    CircleDashed,
    Clock,
    Flame,
    Hand,
    Hourglass,
    Pause,
    RotateCcw,
    SkipForward,
    XOctagon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { NodeRunStatusName, RunStatusName } from "@/shared/events.js";

export type ExecutionStatus = NodeRunStatusName | RunStatusName;

export interface StatusStyle {
    label: string;
    icon: LucideIcon;
    colorVar: string;
    animated: boolean;
}

export const EXECUTION_STATUS_STYLES: Record<ExecutionStatus, StatusStyle> = {
    PENDING: {
        label: "Pendente",
        icon: CircleDashed,
        colorVar: "--status-pending",
        animated: false,
    },
    QUEUED: { label: "Na fila", icon: Clock, colorVar: "--status-queued", animated: false },
    RUNNING: { label: "Rodando", icon: Flame, colorVar: "--status-running", animated: true },
    WAITING_APPROVAL: {
        label: "Aguardando aprovação",
        icon: Hand,
        colorVar: "--status-waiting-approval",
        animated: false,
    },
    WAITING_LIMIT: {
        label: "Pausado por limite",
        icon: Hourglass,
        colorVar: "--status-waiting-limit",
        animated: false,
    },
    // A paused run is on hold like a node waiting for the usage limit, so both share the color.
    PAUSED: { label: "Pausada", icon: Pause, colorVar: "--status-waiting-limit", animated: false },
    SUCCEEDED: {
        label: "Sucesso",
        icon: CheckCircle2,
        colorVar: "--status-succeeded",
        animated: false,
    },
    FAILED: { label: "Falha", icon: XOctagon, colorVar: "--status-failed", animated: false },
    CANCELED: { label: "Cancelado", icon: Ban, colorVar: "--status-canceled", animated: false },
    SKIPPED: { label: "Pulado", icon: SkipForward, colorVar: "--status-canceled", animated: false },
    INTERRUPTED: {
        label: "Interrompido",
        icon: RotateCcw,
        colorVar: "--status-interrupted",
        animated: false,
    },
};
