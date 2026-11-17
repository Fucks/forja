import type { JSX } from "react";

import { assertNever } from "@/lib/assert_never.js";
import type { ValueInput } from "@/web/canvas/inspector/condition_operators.js";
import type { ConditionRule } from "@/web/canvas/inspector/condition_rules.js";
import { Input } from "@/web/components/ui/input.js";
import { Select } from "@/web/components/ui/select.js";

type RuleValue = Pick<ConditionRule, "valueText" | "values">;
type EnumValue = string | number;

interface ConditionValueInputProps {
    label: string;
    valueInput: ValueInput;
    value: RuleValue;
    enumValues: EnumValue[];
    onEdit: (changes: Partial<RuleValue>) => void;
    onApply: (changes: Partial<RuleValue>) => void;
    onBlur: () => void;
}

const TYPED_VALUE_PLACEHOLDER = "true";
const TYPED_LIST_PLACEHOLDER = "approved, merged";
const ENUM_CHOICE_PLACEHOLDER = "Escolher…";

/** The control that fills in the rule's value: nothing, a number, a text or the enum's options. */
export function ConditionValueInput(props: ConditionValueInputProps): JSX.Element | null {
    const { label, valueInput, value, onEdit, onBlur } = props;
    const typedValueProps = {
        "aria-label": label,
        value: value.valueText,
        onChange: (event: { target: { value: string } }) =>
            onEdit({ valueText: event.target.value }),
        onBlur,
    };

    switch (valueInput.kind) {
        case "none":
        case "fixed":
            return null;
        case "number":
            return <Input {...typedValueProps} inputMode="decimal" mono />;
        case "text":
            return <Input {...typedValueProps} />;
        case "typed":
            return <Input {...typedValueProps} placeholder={TYPED_VALUE_PLACEHOLDER} mono />;
        case "typedList":
            return <Input {...typedValueProps} placeholder={TYPED_LIST_PLACEHOLDER} mono />;
        case "enumChoice":
            return <EnumChoice {...props} />;
        case "enumChoices":
            return <EnumChoices {...props} />;
        default:
            return assertNever(valueInput);
    }
}

function EnumChoice({ label, value, enumValues, onApply }: ConditionValueInputProps): JSX.Element {
    const options = enumValues.map((enumValue) => ({
        value: String(enumValue),
        label: String(enumValue),
    }));

    return (
        <Select
            label={label}
            value={value.valueText}
            options={options}
            placeholder={ENUM_CHOICE_PLACEHOLDER}
            onChange={(valueText) => onApply({ valueText })}
        />
    );
}

function EnumChoices({ label, value, enumValues, onApply }: ConditionValueInputProps): JSX.Element {
    function toggle(enumValue: EnumValue, isChosen: boolean): void {
        const otherValues = value.values.filter((chosenValue) => chosenValue !== enumValue);
        const values = isChosen ? [...otherValues, enumValue] : otherValues;

        onApply({ values: enumValues.filter((candidate) => values.includes(candidate)) });
    }

    return (
        <fieldset aria-label={label} className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {enumValues.map((enumValue) => (
                <label key={String(enumValue)} className="flex items-center gap-1">
                    <input
                        type="checkbox"
                        checked={value.values.includes(enumValue)}
                        onChange={(event) => toggle(enumValue, event.target.checked)}
                    />
                    {String(enumValue)}
                </label>
            ))}
        </fieldset>
    );
}
