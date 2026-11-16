import { useId } from "react";
import type { JSX } from "react";

import { describeFieldLabel } from "@/web/canvas/inspector/field_label.js";
import type { FieldLabeling } from "@/web/canvas/inspector/field_label.js";
import { Field } from "@/web/components/ui/field.js";
import { Select } from "@/web/components/ui/select.js";

interface SelectFieldOption<T extends string> {
    value: T;
    label: string;
}

const EMPTY_OPTION_VALUE = "__empty__";

export function SelectField<T extends string>({
    value,
    options,
    onChange,
    ...labeling
}: FieldLabeling & {
    value: T;
    options: SelectFieldOption<T>[];
    onChange: (value: T) => void;
}): JSX.Element {
    const selectId = useId();

    return (
        <Field {...describeFieldLabel(labeling)} htmlFor={selectId}>
            <Select value={value} options={options} onChange={onChange} />
        </Field>
    );
}

// The extra option stands for "no value", so choosing it reports undefined.
export function OptionalSelectField<T extends string>({
    value,
    options,
    emptyLabel,
    onChange,
    ...labeling
}: FieldLabeling & {
    value: T | undefined;
    options: SelectFieldOption<T>[];
    emptyLabel: string;
    onChange: (value: T | undefined) => void;
}): JSX.Element {
    const emptyOption = { value: EMPTY_OPTION_VALUE, label: emptyLabel };

    return (
        <SelectField<string>
            {...labeling}
            value={value ?? EMPTY_OPTION_VALUE}
            options={[emptyOption, ...options]}
            onChange={(selected) => onChange(findOptionValue(options, selected))}
        />
    );
}

export function toSelectOptions<T extends string>(
    values: readonly T[],
    labels: Record<T, string>,
): SelectFieldOption<T>[] {
    return values.map((value) => ({ value, label: labels[value] }));
}

function findOptionValue<T extends string>(
    options: SelectFieldOption<T>[],
    selected: string,
): T | undefined {
    return options.find((option) => option.value === selected)?.value;
}
