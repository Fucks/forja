import { useId } from "react";
import type { JSX } from "react";

import { Field } from "@/web/components/ui/field.js";
import { Select } from "@/web/components/ui/select.js";

interface SelectFieldOption<T extends string> {
    value: T;
    label: string;
}

export function SelectField<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: SelectFieldOption<T>[];
    onChange: (value: T) => void;
}): JSX.Element {
    const selectId = useId();

    return (
        <Field label={label} htmlFor={selectId}>
            <Select value={value} options={options} onChange={onChange} />
        </Field>
    );
}

export function toSelectOptions<T extends string>(
    values: readonly T[],
    labels: Record<T, string>,
): SelectFieldOption<T>[] {
    return values.map((value) => ({ value, label: labels[value] }));
}
