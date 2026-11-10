import { useId } from "react";
import type { JSX } from "react";

import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { Textarea } from "@/web/components/ui/textarea.js";

interface TextFieldProps {
    label: string;
    text: string;
    onChange: (text: string) => void;
    hint?: string;
    placeholder?: string;
    mono?: boolean;
}

// Text is applied when the field loses focus, so typing does not change the draft on every key.
export function TextField({
    label,
    text,
    onChange,
    hint,
    ...inputProps
}: TextFieldProps): JSX.Element {
    const inputId = useId();

    return (
        <Field label={label} htmlFor={inputId} hint={hint}>
            <Input
                {...inputProps}
                defaultValue={text}
                onBlur={(event) => applyChangedText(event.target.value, text, onChange)}
            />
        </Field>
    );
}

export function TextAreaField({
    label,
    text,
    onChange,
    hint,
    ...textareaProps
}: TextFieldProps): JSX.Element {
    const textareaId = useId();

    return (
        <Field label={label} htmlFor={textareaId} hint={hint}>
            <Textarea
                {...textareaProps}
                defaultValue={text}
                onBlur={(event) => applyChangedText(event.target.value, text, onChange)}
            />
        </Field>
    );
}

export function toOptionalText(text: string): string | undefined {
    return text.trim() || undefined;
}

function applyChangedText(
    typedText: string,
    currentText: string,
    onChange: (text: string) => void,
): void {
    if (typedText !== currentText) {
        onChange(typedText);
    }
}
