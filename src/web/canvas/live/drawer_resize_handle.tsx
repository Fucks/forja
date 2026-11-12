import type { JSX, KeyboardEvent, PointerEvent } from "react";

export const DEFAULT_DRAWER_HEIGHT_FRACTION = 0.45;
const MIN_DRAWER_HEIGHT_FRACTION = 0.3;
const MAX_DRAWER_HEIGHT_FRACTION = 0.8;
const KEYBOARD_STEP_FRACTION = 0.05;
const PERCENT = 100;

const KEYBOARD_STEPS: Partial<Record<string, number>> = {
    ArrowUp: KEYBOARD_STEP_FRACTION,
    ArrowDown: -KEYBOARD_STEP_FRACTION,
};

export function DrawerResizeHandle({
    heightFraction,
    onResize,
}: {
    heightFraction: number;
    onResize: (heightFraction: number) => void;
}): JSX.Element {
    function startDragging(event: PointerEvent<HTMLDivElement>): void {
        event.preventDefault();
        const resizeToPointer = (move: globalThis.PointerEvent): void =>
            onResize(clampHeightFraction(fractionBelow(move.clientY)));
        const stopDragging = (): void => {
            window.removeEventListener("pointermove", resizeToPointer);
            window.removeEventListener("pointerup", stopDragging);
        };

        window.addEventListener("pointermove", resizeToPointer);
        window.addEventListener("pointerup", stopDragging);
    }

    function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
        const step = KEYBOARD_STEPS[event.key];
        if (step === undefined) {
            return;
        }

        event.preventDefault();
        onResize(clampHeightFraction(heightFraction + step));
    }

    return (
        <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Altura do painel"
            aria-valuemin={MIN_DRAWER_HEIGHT_FRACTION * PERCENT}
            aria-valuemax={MAX_DRAWER_HEIGHT_FRACTION * PERCENT}
            aria-valuenow={Math.round(heightFraction * PERCENT)}
            tabIndex={0}
            onPointerDown={startDragging}
            onKeyDown={resizeWithKeyboard}
            className="mx-auto mb-2 h-1.5 w-12 shrink-0 cursor-row-resize rounded-full bg-border focus-visible:outline-2 focus-visible:outline-accent"
        />
    );
}

// The drawer sits at the bottom of the window, so its height is what lies below the pointer.
function fractionBelow(clientY: number): number {
    return (window.innerHeight - clientY) / window.innerHeight;
}

function clampHeightFraction(heightFraction: number): number {
    return Math.min(
        MAX_DRAWER_HEIGHT_FRACTION,
        Math.max(MIN_DRAWER_HEIGHT_FRACTION, heightFraction),
    );
}
