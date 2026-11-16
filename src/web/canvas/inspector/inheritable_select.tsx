import { useId } from "react";
import type { JSX } from "react";

import { describeDefault } from "@/web/app/projects/settings_section.js";
import { describeFieldLabel } from "@/web/canvas/inspector/field_label.js";
import type { FieldLabeling } from "@/web/canvas/inspector/field_label.js";
import { Field } from "@/web/components/ui/field.js";
import { Select } from "@/web/components/ui/select.js";

export interface InheritableSelectOption {
    value: string;
    label: string;
}

const PROJECT_DEFAULT_OPTION: InheritableSelectOption = {
    value: "project-default",
    label: "padrão do projeto",
};

// Choosing "padrão do projeto" reports undefined, so the node stops overriding the project.
export function InheritableSelect({
    selected,
    options,
    inheritedLabel,
    onChange,
    ...labeling
}: FieldLabeling & {
    selected: string | undefined;
    options: InheritableSelectOption[];
    inheritedLabel: string | undefined;
    onChange: (selected: string | undefined) => void;
}): JSX.Element {
    const selectId = useId();

    return (
        <Field
            {...describeFieldLabel(labeling)}
            htmlFor={selectId}
            hint={describeInherited(inheritedLabel)}
        >
            <Select
                value={selected ?? PROJECT_DEFAULT_OPTION.value}
                options={[PROJECT_DEFAULT_OPTION, ...options]}
                onChange={(option) =>
                    onChange(option === PROJECT_DEFAULT_OPTION.value ? undefined : option)
                }
            />
        </Field>
    );
}

export function describeInherited(inheritedLabel: string | undefined): string | undefined {
    return inheritedLabel === undefined ? undefined : describeDefault(inheritedLabel);
}
