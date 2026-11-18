import { useLayoutEffect, useState } from "react";

export interface TourPlacement {
    top: number;
    left: number;
}

export const TOUR_POPOVER_WIDTH_PX = 320;
const TOUR_POPOVER_HEIGHT_PX = 220;
const ANCHOR_GAP_PX = 12;
const VIEWPORT_MARGIN_PX = 8;

/**
 * Where to put the tour beside the element `anchorSelector` finds: on the side of the screen with
 * more room. Undefined when the element is missing (a flow without nodes has no node to show).
 */
export function useTourPlacement(anchorSelector: string): TourPlacement | undefined {
    const [placement, setPlacement] = useState<TourPlacement>();

    useLayoutEffect(() => {
        function placeBesideAnchor(): void {
            const anchor = document.querySelector(anchorSelector);
            setPlacement(anchor ? placeBeside(anchor.getBoundingClientRect()) : undefined);
        }

        placeBesideAnchor();
        window.addEventListener("resize", placeBesideAnchor);
        return () => window.removeEventListener("resize", placeBesideAnchor);
    }, [anchorSelector]);

    return placement;
}

function placeBeside(anchorRect: DOMRect): TourPlacement {
    const isAnchorOnTheLeft = anchorRect.left + anchorRect.width / 2 < window.innerWidth / 2;
    const left = isAnchorOnTheLeft
        ? anchorRect.right + ANCHOR_GAP_PX
        : anchorRect.left - ANCHOR_GAP_PX - TOUR_POPOVER_WIDTH_PX;

    return {
        top: keepInViewport(anchorRect.top, window.innerHeight - TOUR_POPOVER_HEIGHT_PX),
        left: keepInViewport(left, window.innerWidth - TOUR_POPOVER_WIDTH_PX),
    };
}

function keepInViewport(position: number, maxPosition: number): number {
    return Math.max(VIEWPORT_MARGIN_PX, Math.min(position, maxPosition - VIEWPORT_MARGIN_PX));
}
