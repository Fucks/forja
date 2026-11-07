import * as RadixDialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import type { CSSProperties, JSX, ReactNode } from "react";

import {
    OVERLAY_SURFACE_CLASSES,
    OverlayBackdrop,
    OverlayHeader,
    WITHOUT_DESCRIPTION,
} from "@/web/components/ui/overlay_parts.js";

type DrawerSide = "right" | "bottom";

const DEFAULT_SIZE_PX: Record<DrawerSide, number> = {
    right: 480,
    bottom: 320,
};

const SIDE_CLASSES: Record<DrawerSide, string> = {
    right: "top-0 right-0 h-full max-w-[95vw] rounded-l-lg",
    bottom: "right-0 bottom-0 left-0 max-h-[90vh] rounded-t-lg",
};

export function Drawer({
    open,
    onOpenChange,
    side,
    title,
    size = DEFAULT_SIZE_PX[side],
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    side: DrawerSide;
    title: string;
    size?: number;
    children: ReactNode;
}): JSX.Element {
    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <OverlayBackdrop />
                <RadixDialog.Content
                    {...WITHOUT_DESCRIPTION}
                    className={clsx(OVERLAY_SURFACE_CLASSES, SIDE_CLASSES[side], "p-4")}
                    style={sizeStyle(side, size)}
                >
                    <OverlayHeader title={title} />
                    <div className="min-h-0 flex-1 overflow-auto">{children}</div>
                </RadixDialog.Content>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    );
}

function sizeStyle(side: DrawerSide, sizePx: number): CSSProperties {
    return side === "right" ? { width: sizePx } : { height: sizePx };
}
