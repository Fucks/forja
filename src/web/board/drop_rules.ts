import { BLOCKED_COLUMN } from "@/engine/board_columns.js";
import type { BoardColumnDef } from "@/engine/board_columns.js";
import { NODE_RUN_TERMINAL } from "@/engine/node_run_state.js";
import { assertNever } from "@/lib/assert_never.js";
import type { BoardCard } from "@/shared/board_types.js";
import type { Trigger } from "@/shared/trigger_types.js";

export type DropAction =
    | { kind: "start_run"; triggerId: string }
    | { kind: "set_manual_column"; column: "backlog" | "needs_human" | "done" }
    | { kind: "not_allowed"; reason: string };

export interface BoardColumnTrigger {
    triggerId: string;
    columnId: string;
}

const RUNNING_ITEM_REASON = "O item está em execução";
const STAGE_WITHOUT_TRIGGER_REASON = "Esta etapa é movida pela execução";
const BLOCKED_COLUMN_REASON = "O item fica em Bloqueado enquanto depender de outro item aberto";
const BLOCKED_ITEM_REASON = "Item bloqueado";

/** `blockerReferences` (e.g. `["#12"]`) name the blockers when a blocked item is refused. */
export function decideDrop(
    card: BoardCard,
    target: BoardColumnDef,
    boardTriggers: BoardColumnTrigger[],
    blockerReferences: readonly string[] = [],
): DropAction {
    if (isRunning(card)) {
        return notAllowed(RUNNING_ITEM_REASON);
    }

    const trigger = boardTriggers.find((candidate) => candidate.columnId === target.id);
    if (trigger) {
        return decideTriggerDrop(card, trigger, blockerReferences);
    }

    return decideColumnDrop(target);
}

export function listBoardColumnTriggers(triggers: Trigger[]): BoardColumnTrigger[] {
    return triggers.flatMap((trigger) => {
        if (!trigger.enabled || trigger.config.kind !== "board_column") {
            return [];
        }
        return [{ triggerId: trigger.id, columnId: trigger.config.columnId }];
    });
}

function isRunning(card: BoardCard): boolean {
    return card.status !== undefined && !NODE_RUN_TERMINAL.has(card.status);
}

function decideTriggerDrop(
    card: BoardCard,
    trigger: BoardColumnTrigger,
    blockerReferences: readonly string[],
): DropAction {
    if (card.columnId === BLOCKED_COLUMN.id) {
        return notAllowed(describeBlockedItem(blockerReferences));
    }

    return { kind: "start_run", triggerId: trigger.triggerId };
}

function describeBlockedItem(blockerReferences: readonly string[]): string {
    if (blockerReferences.length === 0) {
        return BLOCKED_ITEM_REASON;
    }

    return `${BLOCKED_ITEM_REASON} por ${blockerReferences.join(", ")}`;
}

function decideColumnDrop(target: BoardColumnDef): DropAction {
    switch (target.kind) {
        case "backlog":
        case "needs_human":
        case "done":
            return { kind: "set_manual_column", column: target.kind };
        case "stage":
            return notAllowed(STAGE_WITHOUT_TRIGGER_REASON);
        case "blocked":
            return notAllowed(BLOCKED_COLUMN_REASON);
        default:
            return assertNever(target.kind);
    }
}

function notAllowed(reason: string): DropAction {
    return { kind: "not_allowed", reason };
}
