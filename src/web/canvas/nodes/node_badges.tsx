import type { JSX } from "react";

import { Tooltip } from "@/web/components/ui/tooltip.js";

const IMPLICIT_ITEM_EXPLANATION =
    "Dentro de um Map, cada nó recebe o item que está sendo processado. Não precisa ligar.";

const BADGE_CLASSES = "inline-flex shrink-0 items-center gap-1 rounded-sm px-1 text-[10px]";

export function ImplicitItemBadge(): JSX.Element {
    return (
        <Tooltip content={IMPLICIT_ITEM_EXPLANATION}>
            <span className={`${BADGE_CLASSES} bg-surface-raised text-muted`}>automático</span>
        </Tooltip>
    );
}
