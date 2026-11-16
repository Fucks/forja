import { useId } from "react";
import type { JSX } from "react";

import { describeFieldLabel } from "@/web/canvas/inspector/field_label.js";
import type { FieldLabeling } from "@/web/canvas/inspector/field_label.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { Textarea } from "@/web/components/ui/textarea.js";

type TextFieldProps = FieldLabeling & {
    text: string;
    onChange: (text: string) => void;
    hint?: string;
    placeholder?: string;
    mono?: boolean;
};

// Text is applied when the field loses focus, so typing does not change the draft on every key.
export function TextField({
    text,
    onChange,
    hint,
    placeholder,
    mono,
    ...labeling
}: TextFieldProps): JSX.Element {
    const inputId = useId();

    return (
        <Field {...describeFieldLabel(labeling)} htmlFor={inputId} hint={hint}>
            <Input
                placeholder={placeholder}
                mono={mono}
                defaultValue={text}
                onBlur={(event) => applyChangedText(event.target.value, text, onChange)}
            />
        </Field>
    );
}

export function TextAreaField({
    text,
    onChange,
    hint,
    placeholder,
    mono,
    ...labeling
}: TextFieldProps): JSX.Element {
    const textareaId = useId();

    return (
        <Field {...describeFieldLabel(labeling)} htmlFor={textareaId} hint={hint}>
            <Textarea
                placeholder={placeholder}
                mono={mono}
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
