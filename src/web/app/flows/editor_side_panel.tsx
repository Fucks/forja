import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { JSX, ReactNode } from "react";

import { cn } from "@/web/components/ui/cn.js";
import { IconButton } from "@/web/components/ui/icon_button.js";

type PanelSide = "left" | "right";

const PANEL_SIDE_STYLES: Record<
    PanelSide,
    { borderClass: string; collapseIcon: LucideIcon; expandIcon: LucideIcon }
> = {
    left: { borderClass: "border-r", collapseIcon: PanelLeftClose, expandIcon: PanelLeftOpen },
    right: { borderClass: "border-l", collapseIcon: PanelRightClose, expandIcon: PanelRightOpen },
};

export function EditorSidePanel({
    title,
    side,
    widthClass,
    tourAnchor,
    children,
}: {
    title: string;
    side: PanelSide;
    widthClass: string;
    tourAnchor?: string;
    children?: ReactNode;
}): JSX.Element {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { borderClass, collapseIcon, expandIcon } = PANEL_SIDE_STYLES[side];

    return (
        <aside
            aria-label={title}
            data-tour-anchor={tourAnchor}
            className={cn(
                "flex shrink-0 flex-col border-border bg-surface",
                borderClass,
                !isCollapsed && widthClass,
            )}
        >
            <div className="flex items-center justify-between gap-2 p-2">
                {!isCollapsed && <h2 className="px-1 text-sm font-medium">{title}</h2>}
                <IconButton
                    label={isCollapsed ? `Mostrar ${title}` : `Recolher ${title}`}
                    icon={isCollapsed ? expandIcon : collapseIcon}
                    aria-expanded={!isCollapsed}
                    onClick={() => setIsCollapsed(!isCollapsed)}
                />
            </div>
            {!isCollapsed && children}
        </aside>
    );
}
