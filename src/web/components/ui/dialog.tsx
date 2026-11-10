import * as RadixDialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import type { JSX, ReactNode } from "react";

import {
    OVERLAY_SURFACE_CLASSES,
    OverlayBackdrop,
    OverlayHeader,
    WITHOUT_DESCRIPTION,
} from "@/web/components/ui/overlay_parts.js";

type DialogSize = "md" | "lg";

const DIALOG_WIDTH_CLASSES: Record<DialogSize, string> = {
    md: "w-[min(32rem,90vw)]",
    lg: "w-[min(64rem,95vw)]",
};

export function Dialog({
    open,
    onOpenChange,
    title,
    description,
    size = "md",
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    size?: DialogSize;
    children: ReactNode;
}): JSX.Element {
    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <OverlayBackdrop />
                <RadixDialog.Content
                    {...(description ? {} : WITHOUT_DESCRIPTION)}
                    className={clsx(
                        OVERLAY_SURFACE_CLASSES,
                        "top-1/2 left-1/2 max-h-[85vh] -translate-x-1/2",
                        DIALOG_WIDTH_CLASSES[size],
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
