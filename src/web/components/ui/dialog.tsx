import * as RadixDialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import type { JSX, ReactNode } from "react";

import {
    OVERLAY_SURFACE_CLASSES,
    OverlayBackdrop,
    OverlayHeader,
} from "@/web/components/ui/overlay_parts.js";

export function Dialog({
    open,
    onOpenChange,
    title,
    description,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children: ReactNode;
}): JSX.Element {
    // Radix warns about a missing description unless aria-describedby is explicitly undefined.
    const describedBy = description ? {} : { "aria-describedby": undefined };

    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <OverlayBackdrop />
                <RadixDialog.Content
                    {...describedBy}
                    className={clsx(
                        OVERLAY_SURFACE_CLASSES,
                        "top-1/2 left-1/2 max-h-[85vh] w-[min(32rem,90vw)] -translate-x-1/2",
                        "-translate-y-1/2 overflow-auto rounded-lg p-5",
                    )}
                >
                    <OverlayHeader title={title} />
                    {description && (
                        <RadixDialog.Description className="text-muted">
                            {description}
                        </RadixDialog.Description>
                    )}
                    {children}
                </RadixDialog.Content>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    );
}
