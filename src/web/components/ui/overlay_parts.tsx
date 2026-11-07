import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { JSX } from "react";

const CLOSE_ICON_SIZE_PX = 16;

export const OVERLAY_SURFACE_CLASSES =
    "fixed z-50 flex flex-col gap-3 border border-border bg-surface-raised text-text shadow-float " +
    "focus:outline-none";

// Radix warns about a missing description unless aria-describedby is explicitly undefined.
export const WITHOUT_DESCRIPTION = { "aria-describedby": undefined };

export function OverlayBackdrop(): JSX.Element {
    return <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />;
}

export function OverlayHeader({ title }: { title: string }): JSX.Element {
    return (
        <header className="flex items-center justify-between gap-3">
            <RadixDialog.Title className="font-condensed text-lg font-semibold">
                {title}
            </RadixDialog.Title>
            <RadixDialog.Close
                aria-label="Fechar"
                className="rounded-sm p-1 text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
            >
                <X size={CLOSE_ICON_SIZE_PX} aria-hidden="true" />
            </RadixDialog.Close>
        </header>
    );
}
