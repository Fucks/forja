import { MessageSquareText, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { JSX } from "react";

import type { ResponseFieldRow, RowError } from "@/web/canvas/inspector/response_field_rows.js";
import type { ListItemType, ResponseFieldType } from "@/web/canvas/inspector/response_format.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Input } from "@/web/components/ui/input.js";
import { Select } from "@/web/components/ui/select.js";

const FIELD_TYPE_OPTIONS: { value: ResponseFieldType; label: string }[] = [
    { value: "boolean", label: "sim/não" },
    { value: "number", label: "número" },
    { value: "string", label: "texto" },
    { value: "list", label: "lista" },
    { value: "choice", label: "uma das opções" },
];
const LIST_ITEM_TYPE_OPTIONS: { value: ListItemType; label: string }[] = [
    { value: "string", label: "de textos" },
    { value: "number", label: "de números" },
];

interface ResponseFieldRowEditorProps {
    row: ResponseFieldRow;
    rowNumber: number;
    error: RowError;
    onEdit: (changes: Partial<ResponseFieldRow>) => void;
    onApply: (changes: Partial<ResponseFieldRow>) => void;
    onBlur: () => void;
    onRemove: () => void;
}

// Typing only edits the row; it is applied when a text loses focus or a choice is made.
export function ResponseFieldRowEditor({
    row,
    rowNumber,
    error,
    onEdit,
    onApply,
    onBlur,
    onRemove,
}: ResponseFieldRowEditorProps): JSX.Element {
    const errorId = useId();
    const [isDescriptionOpen, setIsDescriptionOpen] = useState(row.description !== "");
    const fieldName = `campo ${rowNumber}`;

    return (
        <fieldset aria-label={`Campo ${rowNumber}`} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
                <Input
                    mono
                    aria-label={`Nome do ${fieldName}`}
                    aria-describedby={error && errorId}
                    invalid={error !== undefined}
                    value={row.name}
                    placeholder="approved"
                    onChange={(event) => onEdit({ name: event.target.value })}
                    onBlur={onBlur}
                />
                <Select
                    label={`Tipo do ${fieldName}`}
                    value={row.type}
                    options={FIELD_TYPE_OPTIONS}
                    onChange={(type) => onApply({ type })}
                />
                <IconButton
                    label={`Descrição do ${fieldName}`}
                    icon={MessageSquareText}
                    aria-pressed={isDescriptionOpen}
                    onClick={() => setIsDescriptionOpen(!isDescriptionOpen)}
                />
                <IconButton label={`Remover o ${fieldName}`} icon={Trash2} onClick={onRemove} />
            </div>
            <RequiredCheckbox
                checked={row.required}
                onChange={(required) => onApply({ required })}
            />
            <TypeDetails
                row={row}
                fieldName={fieldName}
                onEdit={onEdit}
                onApply={onApply}
                onBlur={onBlur}
            />
            {isDescriptionOpen && (
                <Input
                    aria-label={`Texto da descrição do ${fieldName}`}
                    value={row.description}
                    placeholder="O que o agente deve pôr neste campo"
                    onChange={(event) => onEdit({ description: event.target.value })}
                    onBlur={onBlur}
                />
            )}
            {error && (
                <p id={errorId} className="text-xs text-status-failed">
                    {error}
                </p>
            )}
        </fieldset>
    );
}

function RequiredCheckbox({
    checked,
    onChange,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
}): JSX.Element {
    return (
        <label className="inline-flex items-center gap-1.5 text-sm text-text">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="accent-accent"
            />
            obrigatório
        </label>
    );
}

// The options of a choice and the item type of a list only make sense for their own type.
function TypeDetails({
    row,
    fieldName,
    onEdit,
    onApply,
    onBlur,
}: Pick<ResponseFieldRowEditorProps, "row" | "onEdit" | "onApply" | "onBlur"> & {
    fieldName: string;
}): JSX.Element | null {
    if (row.type === "choice") {
        return (
            <Input
                aria-label={`Opções do ${fieldName}`}
                value={row.choicesText}
                placeholder="bug, feature"
                onChange={(event) => onEdit({ choicesText: event.target.value })}
                onBlur={onBlur}
            />
        );
    }
    if (row.type === "list") {
        return (
            <Select
                label={`Itens da lista do ${fieldName}`}
                value={row.itemType}
                options={LIST_ITEM_TYPE_OPTIONS}
                onChange={(itemType) => onApply({ itemType })}
            />
        );
    }

    return null;
}
