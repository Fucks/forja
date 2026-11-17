import { Plus } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import type { JsonSchema } from "@/shared/json_schema.js";
import { OutputSchemaEditor } from "@/web/canvas/inspector/output_schema_editor.js";
import { ResponseFieldRowEditor } from "@/web/canvas/inspector/response_field_row.js";
import { EMPTY_RESPONSE_FIELD_ROW } from "@/web/canvas/inspector/response_field_rows.js";
import type { ResponseFieldRow } from "@/web/canvas/inspector/response_field_rows.js";
import { fromJsonSchema } from "@/web/canvas/inspector/response_format.js";
import { useResponseFieldRows } from "@/web/canvas/inspector/use_response_field_rows.js";
import { Button } from "@/web/components/ui/button.js";
import { Tabs } from "@/web/components/ui/tabs.js";

type FormatTab = "fields" | "json";

interface ResponseFormatProps {
    outputSchema: JsonSchema | undefined;
    onChange: (outputSchema: JsonSchema | undefined) => void;
}

interface ResponseFormatPreset {
    label: string;
    rows: ResponseFieldRow[];
}

const RESPONSE_FORMAT_PRESETS: ResponseFormatPreset[] = [
    {
        label: "Aprovação",
        rows: [
            { ...EMPTY_RESPONSE_FIELD_ROW, name: "approved", type: "boolean", required: true },
            { ...EMPTY_RESPONSE_FIELD_ROW, name: "notes", type: "string" },
        ],
    },
    {
        label: "Pronto?",
        rows: [{ ...EMPTY_RESPONSE_FIELD_ROW, name: "ready", type: "boolean", required: true }],
    },
];

const ADVANCED_FORMAT_NOTICE = "Este formato é avançado demais para o editor visual.";

export function ResponseFormatEditor({ outputSchema, onChange }: ResponseFormatProps): JSX.Element {
    const [activeTab, setActiveTab] = useState<FormatTab>(() =>
        fitsVisualEditor(outputSchema) ? "fields" : "json",
    );

    return (
        <Tabs
            label="Modo de edição do formato"
            value={activeTab}
            onValueChange={setActiveTab}
            tabs={[
                {
                    value: "fields",
                    label: "Campos",
                    content: <ResponseFieldsTab outputSchema={outputSchema} onChange={onChange} />,
                },
                {
                    value: "json",
                    label: "JSON",
                    content: <JsonTab outputSchema={outputSchema} onChange={onChange} />,
                },
            ]}
        />
    );
}

function ResponseFieldsTab({ outputSchema, onChange }: ResponseFormatProps): JSX.Element {
    const editing = useResponseFieldRows(outputSchema, onChange);
    const { rows } = editing;

    if (!rows) {
        return <AdvancedFormatNotice onRestart={editing.restartWithFields} />;
    }

    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
                Diga o que o agente deve devolver. Esses campos aparecem para as Decisões seguintes.
            </p>
            <div className="flex flex-wrap gap-1">
                {RESPONSE_FORMAT_PRESETS.map((preset) => (
                    <Button
                        key={preset.label}
                        size="sm"
                        onClick={() => editing.fillWithRows(preset.rows)}
                    >
                        {preset.label}
                    </Button>
                ))}
            </div>
            {rows.map((row, index) => (
                <ResponseFieldRowEditor
                    key={index}
                    row={row}
                    rowNumber={index + 1}
                    error={editing.rowErrors[index]}
                    onEdit={(changes) => editing.editRow(index, changes)}
                    onApply={(changes) => editing.applyRowChanges(index, changes)}
                    onBlur={editing.applyEditedRows}
                    onRemove={() => editing.removeRow(index)}
                />
            ))}
            <Button variant="ghost" onClick={editing.addRow} className="self-start">
                <Plus aria-hidden className="size-4" />
                Adicionar campo
            </Button>
        </div>
    );
}

function AdvancedFormatNotice({ onRestart }: { onRestart: () => void }): JSX.Element {
    return (
        <div className="flex flex-col gap-2 text-sm">
            <p className="text-muted">{ADVANCED_FORMAT_NOTICE} Edite-o na aba JSON.</p>
            <Button onClick={onRestart} className="self-start">
                Recomeçar com campos
            </Button>
        </div>
    );
}

function JsonTab({ outputSchema, onChange }: ResponseFormatProps): JSX.Element {
    return (
        <div className="flex flex-col gap-2">
            {!fitsVisualEditor(outputSchema) && (
                <p className="text-sm text-muted">{ADVANCED_FORMAT_NOTICE}</p>
            )}
            <OutputSchemaEditor outputSchema={outputSchema} onChange={onChange} />
        </div>
    );
}

function fitsVisualEditor(outputSchema: JsonSchema | undefined): boolean {
    return outputSchema === undefined || fromJsonSchema(outputSchema) !== undefined;
}
