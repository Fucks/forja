import type { JSX } from "react";

import { Button } from "@/web/components/ui/button.js";

export function DraftConflictBanner({ onReload }: { onReload: () => void }): JSX.Element {
    return (
        <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-sm border border-status-failed px-3 py-2 text-sm"
        >
            <span>O fluxo foi alterado em outra aba. Recarregar?</span>
            <Button size="sm" onClick={onReload}>
                Recarregar
            </Button>
        </div>
    );
}
