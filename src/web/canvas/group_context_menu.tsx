import { Maximize2, Ungroup } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { JSX } from "react";

import type { Position } from "@/shared/flow_graph.js";
import { cn } from "@/web/components/ui/cn.js";
import { FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";

const MENU_ICON_SIZE_PX = 14;

export function GroupContextMenu({
    screenPosition,
    onUngroup,
    onFitToContent,
    onClose,
}: {
    screenPosition: Position;
    onUngroup: () => void;
    onFitToContent: () => void;
    onClose: () => void;
}): JSX.Element {
    const menuRef = useRef<HTMLDivElement>(null);
    useCloseOnOutsideInteraction(menuRef, onClose);

    return (
        <div
            ref={menuRef}
            role="menu"
            aria-label="Ações do grupo"
            style={{ left: screenPosition.x, top: screenPosition.y }}
            className="fixed z-50 flex min-w-44 flex-col rounded-md border border-border bg-surface-raised p-1 shadow-float"
        >
            <GroupMenuItem icon={Ungroup} label="Desagrupar" onSelect={onUngroup} />
            <GroupMenuItem icon={Maximize2} label="Ajustar ao conteúdo" onSelect={onFitToContent} />
        </div>
    );
}

function GroupMenuItem({
    icon: Icon,
    label,
    onSelect,
}: {
    icon: LucideIcon;
    label: string;
    onSelect: () => void;
}): JSX.Element {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onSelect}
            className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-text hover:bg-surface",
                FOCUS_RING_CLASSES,
            )}
        >
            <Icon size={MENU_ICON_SIZE_PX} aria-hidden="true" className="text-steel" />
            {label}
        </button>
    );
}

function useCloseOnOutsideInteraction(
    menuRef: { current: HTMLElement | null },
    onClose: () => void,
): void {
    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent): void {
            if (event.key === "Escape") {
                onClose();
            }
        }
        function closeOnPointerOutside(event: PointerEvent): void {
            const isInsideMenu =
                event.target instanceof Node && menuRef.current?.contains(event.target);
            if (!isInsideMenu) {
                onClose();
            }
        }

        document.addEventListener("keydown", closeOnEscape);
        document.addEventListener("pointerdown", closeOnPointerOutside);
        return () => {
            document.removeEventListener("keydown", closeOnEscape);
            document.removeEventListener("pointerdown", closeOnPointerOutside);
        };
    }, [menuRef, onClose]);
}
