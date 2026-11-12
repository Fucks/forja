import type { JSX } from "react";

import { SHORTCUTS } from "@/web/canvas/shortcuts.js";
import { Dialog } from "@/web/components/ui/dialog.js";

export function ShortcutsDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}): JSX.Element {
    return (
        <Dialog open={open} onOpenChange={onOpenChange} title="Atalhos do teclado">
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
                {SHORTCUTS.map((shortcut) => (
                    <div key={shortcut.keys} className="contents">
                        <dt>
                            <kbd className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-sm">
                                {shortcut.keys}
                            </kbd>
                        </dt>
                        <dd className="text-muted">{shortcut.action}</dd>
                    </div>
                ))}
            </dl>
        </Dialog>
    );
}
