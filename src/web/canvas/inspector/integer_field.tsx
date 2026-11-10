import { useId, useState } from "react";
import type { JSX } from "react";
import type { z } from "zod";

import { describeDefault } from "@/web/app/projects/settings_section.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";

export interface IntegerLimits {
    min: number;
    max?: number;
}

const WITHOUT_LIMIT_LABEL = "sem limite";

// The schema decides what an empty field means: its default value, or no value when optional.
export function IntegerField({
    label,
    value,
    schema,
    limits,
    onChange,
}: {
    label: string;
    value: number | undefined;
    schema: z.ZodType<number | undefined>;
    limits: IntegerLimits;
    onChange: (value: number | undefined) => void;
}): JSX.Element {
    const inputId = useId();
    const [fieldText, setFieldText] = useState(formatInteger(value));
    const [limitError, setLimitError] = useState<string>();

    function applyFieldText(): void {
        const parsed = schema.safeParse(parseFieldText(fieldText));
        if (!parsed.success) {
            setLimitError(describeLimits(limits));
            return;
        }

        setLimitError(undefined);
        setFieldText(formatInteger(parsed.data));
        if (parsed.data !== value) {
            onChange(parsed.data);
        }
    }

    return (
        <Field label={label} htmlFor={inputId} error={limitError}>
            <Input
                type="number"
                min={limits.min}
                max={limits.max}
                value={fieldText}
                placeholder={describeEmptyField(schema)}
                onChange={(event) => setFieldText(event.target.value)}
                onBlur={applyFieldText}
            />
        </Field>
    );
}

function parseFieldText(fieldText: string): number | undefined {
    return fieldText.trim() === "" ? undefined : Number(fieldText);
}

function formatInteger(value: number | undefined): string {
    return value === undefined ? "" : String(value);
}

function describeLimits({ min, max }: IntegerLimits): string {
    if (max === undefined) {
        return `Use um número inteiro a partir de ${min}.`;
    }

    return `Use um número inteiro entre ${min} e ${max}.`;
}

function describeEmptyField(schema: z.ZodType<number | undefined>): string {
    const emptyValue = schema.safeParse(undefined).data;

    return emptyValue === undefined ? WITHOUT_LIMIT_LABEL : describeDefault(emptyValue);
}
