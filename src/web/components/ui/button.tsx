import { Slot, Slottable } from "@radix-ui/react-slot";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, JSX } from "react";

import { cn } from "@/web/components/ui/cn.js";
import {
    CONTROL_HEIGHT_CLASSES,
    DISABLED_CLASSES,
    FOCUS_RING_CLASSES,
} from "@/web/components/ui/control_styles.js";
import type { ControlSize } from "@/web/components/ui/control_styles.js";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ComponentProps<"button">;

const BUTTON_BASE_CLASSES =
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm px-2.5 text-sm font-medium whitespace-nowrap transition-colors";

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: "bg-accent text-bg hover:bg-accent-strong",
    secondary: "border border-border bg-surface text-text hover:bg-surface-raised",
    ghost: "text-text hover:bg-surface-raised",
    danger: "bg-status-failed text-bg hover:opacity-90",
};

export function Button({
    variant = "secondary",
    size = "md",
    loading = false,
    asChild = false,
    className,
    disabled,
    children,
    ...buttonProps
}: ButtonProps & {
    variant?: ButtonVariant;
    size?: ControlSize;
    loading?: boolean;
    asChild?: boolean;
}): JSX.Element {
    const Root = asChild ? Slot : "button";

    return (
        <Root
            type={asChild ? undefined : "button"}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(
                BUTTON_BASE_CLASSES,
                FOCUS_RING_CLASSES,
                DISABLED_CLASSES,
                CONTROL_HEIGHT_CLASSES[size],
                BUTTON_VARIANT_CLASSES[variant],
                className,
            )}
            {...buttonProps}
        >
            {loading && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
            <Slottable>{children}</Slottable>
        </Root>
    );
}
