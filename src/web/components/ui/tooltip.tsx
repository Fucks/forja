import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { JSX, ReactElement, ReactNode } from "react";

export const TOOLTIP_OPEN_DELAY_MS = 300;
const TRIGGER_GAP_PX = 6;

export function Tooltip({
    content,
    children,
}: {
    content: ReactNode;
    children: ReactElement;
}): JSX.Element {
    // Each tooltip brings its own provider, so it works in any tree without setup in main.tsx.
    return (
        <RadixTooltip.Provider delayDuration={TOOLTIP_OPEN_DELAY_MS}>
            <RadixTooltip.Root>
                <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
                <RadixTooltip.Portal>
                    <RadixTooltip.Content
                        sideOffset={TRIGGER_GAP_PX}
                        className="z-50 rounded-sm border border-border bg-surface-raised px-2 py-1 text-xs text-text shadow-float"
                    >
                        {content}
                    </RadixTooltip.Content>
                </RadixTooltip.Portal>
            </RadixTooltip.Root>
        </RadixTooltip.Provider>
    );
}
