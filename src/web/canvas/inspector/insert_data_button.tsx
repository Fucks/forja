import { Braces } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { JSX } from "react";

import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import { DataPickerPopover } from "@/web/canvas/inspector/data_picker_popover.js";
import { useCloseOnPointerOutside } from "@/web/canvas/inspector/use_close_on_pointer_outside.js";
import { Button } from "@/web/components/ui/button.js";

/** Picks a known field and hands back its prompt variable, such as `{{nodes.tl.summary}}`. */
export function InsertDataButton({
    fields,
    onInsert,
}: {
    fields: PickableDataField[];
    onInsert: (variable: string) => void;
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const closePopover = useCallback(() => setIsOpen(false), []);
    useCloseOnPointerOutside(containerRef, closePopover);

    function insertPickedField(path: string): void {
        closePopover();
        onInsert(toPromptVariable(path));
    }

    return (
        <div ref={containerRef} className="relative">
            <Button
                variant="ghost"
                size="sm"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Braces aria-hidden className="size-4" />
                Inserir dado
            </Button>
            {isOpen && (
                <DataPickerPopover
                    fields={fields}
                    onPick={insertPickedField}
                    onClose={closePopover}
                />
            )}
        </div>
    );
}

function toPromptVariable(path: string): string {
    return `{{${path}}}`;
}
