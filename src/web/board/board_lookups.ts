import type { UniqueIdentifier } from "@dnd-kit/core";

import type { BoardColumnDef } from "@/engine/board_columns.js";
import type { BoardCard, BoardView } from "@/shared/board_types.js";
import type { WorkItem } from "@/shared/work_item_types.js";

export function findCard(board: BoardView, itemId: UniqueIdentifier): BoardCard | undefined {
    return board.cards.find((card) => card.item.id === itemId);
}

export function findColumn(
    board: BoardView,
    columnId: UniqueIdentifier | undefined,
): BoardColumnDef | undefined {
    return board.columns.find((column) => column.id === columnId);
}

export function findBlockers(board: BoardView, item: WorkItem): WorkItem[] {
    return board.cards
        .map((card) => card.item)
        .filter((candidate) => item.blockedBy.includes(candidate.id));
}
