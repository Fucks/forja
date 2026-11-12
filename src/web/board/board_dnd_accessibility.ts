import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from "@dnd-kit/core";

import type { BoardView } from "@/shared/board_types.js";
import { findCard, findColumn } from "@/web/board/board_lookups.js";

export const BOARD_SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
    draggable:
        "Para pegar o card, pressione espaço. Use as setas para a esquerda e para a direita " +
        "para trocar de coluna, espaço para soltar e Esc para cancelar.",
};

export function buildBoardAnnouncements(board: BoardView): Announcements {
    const cardTitle = (itemId: UniqueIdentifier): string =>
        findCard(board, itemId)?.item.title ?? "Card";
    const columnLabel = (columnId: UniqueIdentifier | undefined): string | undefined =>
        findColumn(board, columnId)?.label;

    return {
        onDragStart: ({ active }) => `${cardTitle(active.id)} pego.`,
        onDragOver: ({ active, over }) =>
            describeDropTarget(cardTitle(active.id), columnLabel(over?.id), "sobre"),
        onDragEnd: ({ active, over }) =>
            describeDropTarget(cardTitle(active.id), columnLabel(over?.id), "solto em"),
        onDragCancel: ({ active }) => `Movimento de ${cardTitle(active.id)} cancelado.`,
    };
}

function describeDropTarget(
    cardTitle: string,
    columnLabel: string | undefined,
    preposition: "sobre" | "solto em",
): string {
    if (!columnLabel) {
        return `${cardTitle} fora das colunas.`;
    }

    return `${cardTitle} ${preposition} ${columnLabel}.`;
}
