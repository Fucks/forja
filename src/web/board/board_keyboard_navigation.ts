import type { ClientRect, KeyboardCoordinateGetter } from "@dnd-kit/core";

const COLUMN_STEPS_BY_KEY: Partial<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

// Cards are not reordered inside a column, so each arrow press jumps to the neighbor column.
export const moveToNeighborColumn: KeyboardCoordinateGetter = (
    event,
    { currentCoordinates, context },
) => {
    const step = COLUMN_STEPS_BY_KEY[event.code];
    if (step === undefined) {
        return undefined;
    }

    event.preventDefault();
    const columnRects = [...context.droppableRects.values()].sort((a, b) => a.left - b.left);
    const currentIndex = columnRects.findIndex((rect) => containsX(rect, currentCoordinates.x));
    const currentColumn = columnRects[currentIndex];
    const neighborColumn = columnRects[currentIndex + step];
    if (!currentColumn || !neighborColumn) {
        return undefined;
    }

    return {
        x: currentCoordinates.x + neighborColumn.left - currentColumn.left,
        y: currentCoordinates.y,
    };
};

function containsX(rect: ClientRect, x: number): boolean {
    return rect.left <= x && x < rect.right;
}
