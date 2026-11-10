import { useId, useState } from "react";
import type { JSX } from "react";

import { jsonSchemaSchema } from "@/shared/json_schema.js";
import type { JsonSchema } from "@/shared/json_schema.js";
import { Button } from "@/web/components/ui/button.js";
import { Field } from "@/web/components/ui/field.js";
import { Textarea } from "@/web/components/ui/textarea.js";

type ParsedOutputSchema =
    { ok: true; schema: JsonSchema | undefined } | { ok: false; error: string };

const EXAMPLE_OUTPUT_SCHEMA: JsonSchema = {
    type: "object",
    properties: { approved: { type: "boolean" } },
};
const JSON_INDENT_SPACES = 2;
const INVALID_JSON_MESSAGE = "JSON inválido.";
const NOT_AN_OBJECT_MESSAGE = "O schema precisa ser um objeto JSON.";

export function OutputSchemaEditor({
    outputSchema,
    onChange,
}: {
    outputSchema: JsonSchema | undefined;
    onChange: (outputSchema: JsonSchema | undefined) => void;
}): JSX.Element {
    const textareaId = useId();
    const [schemaText, setSchemaText] = useState(() => formatOutputSchema(outputSchema));
    const [parseError, setParseError] = useState<string>();

    function applySchemaText(text: string): void {
        const parsed = parseOutputSchema(text);
        if (!parsed.ok) {
            setParseError(parsed.error);
            return;
        }

        setParseError(undefined);
        if (text !== formatOutputSchema(outputSchema)) {
            onChange(parsed.schema);
        }
    }

    function fillWithExample(): void {
        const exampleText = formatOutputSchema(EXAMPLE_OUTPUT_SCHEMA);
        setSchemaText(exampleText);
        applySchemaText(exampleText);
    }

    return (
        <div className="flex flex-col gap-2">
            <Field label="Schema de saída" htmlFor={textareaId} error={parseError}>
                <Textarea
                    mono
                    rows={8}
                    value={schemaText}
                    onChange={(event) => setSchemaText(event.target.value)}
                    onBlur={(event) => applySchemaText(event.target.value)}
                />
            </Field>
            <div>
                <Button size="sm" onClick={fillWithExample}>
                    Exemplo
                </Button>
            </div>
        </div>
    );
}

function formatOutputSchema(outputSchema: JsonSchema | undefined): string {
    if (!outputSchema) {
        return "";
    }

    return JSON.stringify(outputSchema, null, JSON_INDENT_SPACES);
}

function parseOutputSchema(text: string): ParsedOutputSchema {
    if (!text.trim()) {
        return { ok: true, schema: undefined };
    }

    const json = parseJson(text);
    if (!json.ok) {
        return { ok: false, error: INVALID_JSON_MESSAGE };
    }

    const schema = jsonSchemaSchema.safeParse(json.parsed);
    if (!schema.success) {
        return { ok: false, error: NOT_AN_OBJECT_MESSAGE };
    }

    return { ok: true, schema: schema.data };
}

function parseJson(text: string): { ok: true; parsed: unknown } | { ok: false } {
    try {
        return { ok: true, parsed: JSON.parse(text) };
    } catch {
        return { ok: false };
    }
}
