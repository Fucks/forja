import { cn } from "@/web/components/ui/cn.js";

export type ControlSize = "sm" | "md";

export const FOCUS_RING_CLASSES =
    "outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

export const CONTROL_HEIGHT_CLASSES: Record<ControlSize, string> = {
    sm: "h-7",
    md: "h-8",
};

const CONTROL_BOX_CLASSES =
    "w-full rounded-sm border border-border bg-surface px-2.5 text-sm text-text placeholder:text-muted";

const INVALID_CONTROL_CLASSES = "border-status-failed";

export function buildControlClassName(options: { isInvalid: boolean; isMono?: boolean }): string {
    return cn(
        CONTROL_BOX_CLASSES,
        FOCUS_RING_CLASSES,
        options.isInvalid && INVALID_CONTROL_CLASSES,
        options.isMono && "font-mono",
    );
}
