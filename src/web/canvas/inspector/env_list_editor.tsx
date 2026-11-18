import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { JSX } from "react";

import type { ScriptEnvVar } from "@/shared/node_configs/script_config.js";
import { useCredentials } from "@/web/app/settings/use_credentials.js";
import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import { EnvVarRowEditor } from "@/web/canvas/inspector/env_var_row_editor.js";
import type { CredentialOption } from "@/web/canvas/inspector/env_var_row_editor.js";
import { useEnvVarRows } from "@/web/canvas/inspector/use_env_var_rows.js";
import { Button } from "@/web/components/ui/button.js";
import { IconButton } from "@/web/components/ui/icon_button.js";

export function EnvListEditor({
    env,
    fields,
    onChange,
}: {
    env: ScriptEnvVar[];
    fields: PickableDataField[];
    onChange: (env: ScriptEnvVar[]) => void;
}): JSX.Element {
    const editing = useEnvVarRows(env, onChange);
    const credentialOptions = useCredentialOptions();
    const lastIndex = editing.rows.length - 1;

    return (
        <div className="flex flex-col gap-3">
            {editing.rows.map((row, index) => (
                <div key={index} className="flex items-start gap-1">
                    <EnvVarRowEditor
                        row={row}
                        rowNumber={index + 1}
                        nameError={editing.nameErrors[index]}
                        fields={fields}
                        credentialOptions={credentialOptions}
                        onEdit={(changes) => editing.editRow(index, changes)}
                        onApply={(changes) => editing.applyRowChanges(index, changes)}
                        onBlur={editing.applyEditedRows}
                    />
                    <RowActions
                        rowNumber={index + 1}
                        canMoveUp={index > 0}
                        canMoveDown={index < lastIndex}
                        onMoveUp={() => editing.moveRow(index, -1)}
                        onMoveDown={() => editing.moveRow(index, 1)}
                        onRemove={() => editing.removeRow(index)}
                    />
                </div>
            ))}
            <Button variant="ghost" onClick={editing.addRow} className="self-start">
                <Plus aria-hidden className="size-4" />
                Adicionar variável
            </Button>
        </div>
    );
}

function useCredentialOptions(): CredentialOption[] {
    const credentials = useCredentials().data ?? [];

    return credentials.map((credential) => ({ value: credential.id, label: credential.name }));
}

function RowActions({
    rowNumber,
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
    onRemove,
}: {
    rowNumber: number;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onRemove: () => void;
}): JSX.Element {
    return (
        <div className="flex items-center">
            <IconButton
                label={`Subir a variável ${rowNumber}`}
                icon={ArrowUp}
                disabled={!canMoveUp}
                onClick={onMoveUp}
            />
            <IconButton
                label={`Descer a variável ${rowNumber}`}
                icon={ArrowDown}
                disabled={!canMoveDown}
                onClick={onMoveDown}
            />
            <IconButton
                label={`Remover a variável ${rowNumber}`}
                icon={Trash2}
                onClick={onRemove}
            />
        </div>
    );
}
