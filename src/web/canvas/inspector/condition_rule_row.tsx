import { Trash2 } from "lucide-react";
import type { JSX } from "react";

import type { DataField } from "@/engine/available_data.js";
import { describeOperatorTypeMismatch } from "@/engine/validation_rules/condition_rules.js";
import { findOperatorOption } from "@/web/canvas/inspector/condition_operators.js";
import type { OperatorOption, RuleOperator } from "@/web/canvas/inspector/condition_operators.js";
import { findRuleField, listRuleOperatorOptions } from "@/web/canvas/inspector/condition_rules.js";
import type { ConditionRule } from "@/web/canvas/inspector/condition_rules.js";
import { ConditionValueInput } from "@/web/canvas/inspector/condition_value_input.js";
import type { ComparisonOperator } from "@/web/canvas/inspector/condition_text.js";
import { DataPicker } from "@/web/canvas/inspector/data_picker.js";
import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Select } from "@/web/components/ui/select.js";

type RuleValueChanges = Partial<Pick<ConditionRule, "valueText" | "values">>;

/** What a row can do to its rule. */
export interface RuleEditing {
    typePath: (path: string) => void;
    pickPath: (path: string) => void;
    chooseOperator: (option: OperatorOption) => void;
    editValue: (changes: RuleValueChanges) => void;
    applyValue: (changes: RuleValueChanges) => void;
    applyEditedRule: () => void;
    remove: (() => void) | undefined;
}

interface ConditionRuleRowProps {
    rule: ConditionRule;
    ruleNumber: number;
    fields: PickableDataField[];
    editing: RuleEditing;
}

const NO_OPERATOR_ID = "";

// Typing only edits the row; the rule is applied when a field loses focus or a choice is made.
export function ConditionRuleRow({
    rule,
    ruleNumber,
    fields,
    editing,
}: ConditionRuleRowProps): JSX.Element {
    const ruleName = `regra ${ruleNumber}`;
    const field = findRuleField(rule, fields);
    const operatorOptions = listRuleOperatorOptions(rule, fields);
    const currentOption = findOperatorOption(operatorOptions, rule);
    const typeMismatch = describeRuleTypeMismatch(rule, field);

    return (
        <fieldset aria-label={`Regra ${ruleNumber}`} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
                <DataPicker
                    label={`Caminho da ${ruleName}`}
                    path={rule.path}
                    fields={fields}
                    onPick={editing.pickPath}
                    onType={editing.typePath}
                    onTypingDone={editing.applyEditedRule}
                />
                {editing.remove && (
                    <IconButton
                        label={`Remover ${ruleName}`}
                        icon={Trash2}
                        onClick={editing.remove}
                    />
                )}
            </div>
            <div className="flex items-center gap-1">
                <Select
                    label={`Operador da ${ruleName}`}
                    value={currentOption?.id ?? NO_OPERATOR_ID}
                    options={operatorOptions.map(({ id, label }) => ({ value: id, label }))}
                    onChange={(optionId) =>
                        chooseOperatorById(operatorOptions, optionId, editing.chooseOperator)
                    }
                />
                {currentOption && (
                    <ConditionValueInput
                        label={`Valor da ${ruleName}`}
                        valueInput={currentOption.valueInput}
                        value={rule}
                        enumValues={field?.enumValues ?? []}
                        onEdit={editing.editValue}
                        onApply={editing.applyValue}
                        onBlur={editing.applyEditedRule}
                    />
                )}
            </div>
            {typeMismatch && (
                <p role="alert" className="text-xs text-status-failed">
                    {typeMismatch}
                </p>
            )}
        </fieldset>
    );
}

function chooseOperatorById(
    options: OperatorOption[],
    optionId: string,
    chooseOperator: (option: OperatorOption) => void,
): void {
    const chosenOption = options.find((option) => option.id === optionId);
    if (chosenOption) {
        chooseOperator(chosenOption);
    }
}

function describeRuleTypeMismatch(
    rule: ConditionRule,
    field: DataField | undefined,
): string | undefined {
    if (!field) {
        return undefined;
    }

    return describeOperatorTypeMismatch(toComparisonOperator(rule.operator), field.type);
}

// 'não existe' is a negated `exists`, so it fits wherever `exists` does.
function toComparisonOperator(operator: RuleOperator): ComparisonOperator {
    return operator === "notExists" ? "exists" : operator;
}
