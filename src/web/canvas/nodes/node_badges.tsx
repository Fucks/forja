import { AlertTriangle } from "lucide-react";
import type { JSX } from "react";

import { cn } from "@/web/components/ui/cn.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

const IMPLICIT_ITEM_EXPLANATION =
    "Dentro de um Map, cada nó recebe o item que está sendo processado. Não precisa ligar.";

const BADGE_ICON_SIZE_PX = 12;

const BADGE_CLASSES = "inline-flex shrink-0 items-center gap-1 rounded-sm px-1 text-[10px]";

export function ImplicitItemBadge(): JSX.Element {
    return (
        <Tooltip content={IMPLICIT_ITEM_EXPLANATION}>
            <span className={cn(BADGE_CLASSES, "bg-surface-raised text-muted")}>automático</span>
        </Tooltip>
    );
}

// Not a button: a click on it reaches the node, which selects it and shows it in the inspector.
export function NeedsConfigBadge(): JSX.Element {
    return (
        <span className={cn(BADGE_CLASSES, "bg-status-failed/10 text-status-failed")}>
            <AlertTriangle size={BADGE_ICON_SIZE_PX} aria-hidden="true" />
            falta configurar
        </span>
    );
}
