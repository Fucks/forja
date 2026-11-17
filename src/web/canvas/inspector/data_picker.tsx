import { useCallback, useRef, useState } from "react";
import type { JSX } from "react";

import type { DataField } from "@/engine/available_data.js";
import { DataPickerPopover } from "@/web/canvas/inspector/data_picker_popover.js";
import { useCloseOnPointerOutside } from "@/web/canvas/inspector/use_close_on_pointer_outside.js";
import { Button } from "@/web/components/ui/button.js";
import { Input } from "@/web/components/ui/input.js";

export type PickableDataField = DataField & { sampleText?: string };

interface DataPickerProps {
    label: string;
    path: string;
    fields: PickableDataField[];
    onPick: (path: string) => void;
    onType: (path: string) => void;
    onTypingDone: () => void;
}

type PickerMode = "choosing" | "typing";

const EMPTY_CHOICE_TEXT = "Escolher dado…";
const UNKNOWN_PATH_WARNING =
    "Este caminho não aparece nos formatos conhecidos; ele só funciona se o dado existir na execução";

/** Chooses a data path from the known fields, or lets the user type any path by hand. */
export function DataPicker({
    label,
    path,
    fields,
    onPick,
    onType,
    onTypingDone,
}: DataPickerProps): JSX.Element {
    const pickerRef = useRef<HTMLDivElement>(null);
    const chosenField = fields.find((field) => field.path === path);
    const isUnknownPath = path.trim() !== "" && !chosenField;
    const [mode, setMode] = useState<PickerMode>(isUnknownPath ? "typing" : "choosing");
    const [isOpen, setIsOpen] = useState(false);
    const closePopover = useCallback(() => setIsOpen(false), []);
    useCloseOnPointerOutside(pickerRef, closePopover);

    function pickField(pickedPath: string): void {
        closePopover();
        onPick(pickedPath);
    }

    function startTyping(): void {
        closePopover();
        setMode("typing");
    }

    function chooseFromList(): void {
        setMode("choosing");
        setIsOpen(true);
    }

    return (
        <div ref={pickerRef} className="relative flex min-w-0 flex-1 flex-col gap-1">
            {mode === "typing" ? (
                <TypedPathField
                    label={label}
                    path={path}
                    onType={onType}
                    onTypingDone={onTypingDone}
                    onChooseFromList={chooseFromList}
                />
            ) : (
                <Button
                    aria-label={label}
                    aria-expanded={isOpen}
                    onClick={() => setIsOpen(!isOpen)}
                    className="justify-start truncate"
                >
                    {chosenField?.label ?? (path || EMPTY_CHOICE_TEXT)}
                </Button>
            )}
            {isOpen && (
                <DataPickerPopover
                    fields={fields}
                    onPick={pickField}
                    onTypePath={startTyping}
                    onClose={closePopover}
                />
            )}
            {isUnknownPath && <p className="text-xs text-status-waiting">{UNKNOWN_PATH_WARNING}</p>}
        </div>
    );
}

function TypedPathField({
    label,
    path,
    onType,
    onTypingDone,
    onChooseFromList,
}: Omit<DataPickerProps, "fields" | "onPick"> & { onChooseFromList: () => void }): JSX.Element {
    return (
        <div className="flex items-center gap-1">
            <Input
                aria-label={label}
                value={path}
                placeholder="nodes.reviewer.result.approved"
                mono
                onChange={(event) => onType(event.target.value)}
                onBlur={onTypingDone}
            />
            <Button variant="ghost" size="sm" onClick={onChooseFromList}>
                Escolher da lista
            </Button>
        </div>
    );
}
