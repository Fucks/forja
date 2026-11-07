import { AlertTriangle } from "lucide-react";
import type { JSX } from "react";

const INVALID_ICON_SIZE_PX = 14;

export function outlineClasses({
    selected = false,
    invalid = false,
}: {
    selected?: boolean;
    invalid?: boolean;
}): string {
    if (invalid) {
        return "border-[1.5px] border-status-failed";
    }

    if (selected) {
        return "border-[1.5px] border-accent";
    }

    return "border border-border";
}

export function InvalidMarker(): JSX.Element {
    return (
        <AlertTriangle
            role="img"
            aria-label="Configuração inválida"
            size={INVALID_ICON_SIZE_PX}
            className="shrink-0 text-status-failed"
        />
    );
}
