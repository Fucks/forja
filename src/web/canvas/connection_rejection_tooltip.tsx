import type { JSX } from "react";

import type { ConnectionRejection } from "@/web/canvas/use_canvas_connections.js";

const CURSOR_OFFSET_PX = 12;

export function ConnectionRejectionTooltip({
    rejection,
}: {
    rejection: ConnectionRejection | undefined;
}): JSX.Element | null {
    if (!rejection) {
        return null;
    }

    const { reason, screenPosition } = rejection;

    return (
        <div
            role="alert"
            className="pointer-events-none fixed z-50 rounded-sm border border-border bg-surface-raised px-2 py-1 text-xs text-text shadow-float"
            style={{
                left: screenPosition.x + CURSOR_OFFSET_PX,
                top: screenPosition.y + CURSOR_OFFSET_PX,
            }}
        >
            {reason}
        </div>
    );
}
