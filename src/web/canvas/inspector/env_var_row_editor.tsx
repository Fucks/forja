import { CircleAlert } from "lucide-react";
import { useId } from "react";
import type { JSX } from "react";

import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import type {
    EnvVarNameError,
    EnvVarRow,
    EnvVarSource,
} from "@/web/canvas/inspector/env_var_rows.js";
import { InsertDataButton } from "@/web/canvas/inspector/insert_data_button.js";
import { Input } from "@/web/components/ui/input.js";
import { Select } from "@/web/components/ui/select.js";

export interface CredentialOption {
    value: string;
    label: string;
}

interface EnvVarRowEditorProps {
    row: EnvVarRow;
    rowNumber: number;
    nameError: EnvVarNameError;
    fields: PickableDataField[];
    credentialOptions: CredentialOption[];
    onEdit: (changes: Partial<EnvVarRow>) => void;
    onApply: (changes: Partial<EnvVarRow>) => void;
    onBlur: () => void;
}

const SOURCE_OPTIONS: { value: EnvVarSource; label: string }[] = [
    { value: "text", label: "Texto" },
    { value: "credential", label: "Credencial" },
];

// Typing only edits the row; it is applied when a text loses focus or a choice is made.
export function EnvVarRowEditor({
    row,
    rowNumber,
    nameError,
    fields,
    credentialOptions,
    onEdit,
    onApply,
    onBlur,
}: EnvVarRowEditorProps): JSX.Element {
    const errorId = useId();
    const variableName = `variável ${rowNumber}`;
    const hasNameError = nameError !== undefined;

    return (
        <fieldset aria-label={`Variável ${rowNumber}`} className="flex flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-1">
                <Input
                    mono
                    aria-label={`Nome da ${variableName}`}
                    aria-describedby={hasNameError ? errorId : undefined}
                    invalid={hasNameError}
                    value={row.name}
                    placeholder="NOME"
                    onChange={(event) => onEdit({ name: event.target.value })}
                    onBlur={onBlur}
                />
                {hasNameError && (
                    <CircleAlert aria-hidden className="size-4 shrink-0 text-status-failed" />
                )}
                <Select
                    label={`Tipo da ${variableName}`}
                    value={row.source}
                    options={SOURCE_OPTIONS}
                    onChange={(source) => onApply({ source })}
                />
            </div>
            <EnvVarValueInput
                row={row}
                variableName={variableName}
                fields={fields}
                credentialOptions={credentialOptions}
                onEdit={onEdit}
                onApply={onApply}
                onBlur={onBlur}
            />
            {hasNameError && (
                <p id={errorId} className="text-xs text-status-failed">
                    {nameError}
                </p>
            )}
        </fieldset>
    );
}

function EnvVarValueInput({
    row,
    variableName,
    fields,
    credentialOptions,
    onEdit,
    onApply,
    onBlur,
}: Omit<EnvVarRowEditorProps, "rowNumber" | "nameError"> & { variableName: string }): JSX.Element {
    if (row.source === "credential") {
        return (
            <Select
                label={`Credencial da ${variableName}`}
                value={row.credentialId}
                options={credentialOptions}
                placeholder="Escolha uma credencial"
                onChange={(credentialId) => onApply({ credentialId })}
            />
        );
    }

    return (
        <div className="flex items-center gap-1">
            <Input
                mono
                aria-label={`Valor da ${variableName}`}
                value={row.value}
                onChange={(event) => onEdit({ value: event.target.value })}
                onBlur={onBlur}
            />
            <InsertDataButton
                fields={fields}
                onInsert={(variable) => onApply({ value: row.value + variable })}
            />
        </div>
    );
}
