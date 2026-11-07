import { clsx } from "clsx";
import type { JSX } from "react";

import { EXECUTION_STATUS_STYLES } from "@/web/components/ui/execution_status.js";
import type { ExecutionStatus } from "@/web/components/ui/execution_status.js";

type BadgeSize = "sm" | "md";

const BADGE_SIZE_CLASSES: Record<BadgeSize, string> = {
    sm: "gap-1 px-1.5 py-0.5 text-xs",
    md: "gap-1.5 px-2 py-1 text-sm",
};

const ICON_SIZE_PX: Record<BadgeSize, number> = {
    sm: 12,
    md: 14,
};

export function StatusBadge({
    status,
    size = "md",
    showLabel = true,
}: {
    status: ExecutionStatus;
    size?: BadgeSize;
    showLabel?: boolean;
}): JSX.Element {
    const { label, icon: Icon, colorVar, animated } = EXECUTION_STATUS_STYLES[status];
    const accessibleName = showLabel ? {} : { role: "img", "aria-label": label };

    return (
        <span
            {...accessibleName}
            className={clsx(
                "inline-flex items-center rounded-sm border border-current font-medium",
                BADGE_SIZE_CLASSES[size],
                animated && "animate-ember",
            )}
            style={{ color: `var(${colorVar})` }}
        >
            <Icon size={ICON_SIZE_PX[size]} aria-hidden="true" />
            {showLabel && <span>{label}</span>}
        </span>
    );
}
