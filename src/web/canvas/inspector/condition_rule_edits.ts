import type { DataField } from "@/engine/available_data.js";
import {
    findOperatorOption,
    operatorsForField,
} from "@/web/canvas/inspector/condition_operators.js";
import type { OperatorOption } from "@/web/canvas/inspector/condition_operators.js";
import { findRuleField, listRuleOperatorOptions } from "@/web/canvas/inspector/condition_rules.js";
import type { ConditionRule } from "@/web/canvas/inspector/condition_rules.js";

/** The rule reading another path; an operator or value that does not fit the new field restarts. */
export function withRulePath(
    rule: ConditionRule,
    path: string,
    fields: DataField[],
): ConditionRule {
    const currentOption = findCurrentOption(rule, fields);
    const movedRule = { ...rule, path };
    const options = operatorsForField(findRuleField(movedRule, fields));
    const keptOption = findOperatorOption(options, movedRule);
    if (keptOption && currentOption && haveSameValueInput(keptOption, currentOption)) {
        return movedRule;
    }

    const [firstOption] = options;
    if (!firstOption) {
        return movedRule;
    }

    return {
        path,
        operator: firstOption.operator,
        valueText: fixedValueText(firstOption),
        values: [],
    };
}

/** The rule with another operator; the value is kept only when it is filled in the same way. */
export function withOperatorOption(
    rule: ConditionRule,
    option: OperatorOption,
    fields: DataField[],
): ConditionRule {
    const currentOption = findCurrentOption(rule, fields);
    if (currentOption && haveSameValueInput(option, currentOption)) {
        return { ...rule, operator: option.operator, valueText: valueTextFor(option, rule) };
    }

    return { ...rule, operator: option.operator, valueText: fixedValueText(option), values: [] };
}

function findCurrentOption(rule: ConditionRule, fields: DataField[]): OperatorOption | undefined {
    return findOperatorOption(listRuleOperatorOptions(rule, fields), rule);
}

function haveSameValueInput(first: OperatorOption, second: OperatorOption): boolean {
    return first.valueInput.kind === second.valueInput.kind;
}

function valueTextFor(option: OperatorOption, rule: ConditionRule): string {
    if (option.valueInput.kind === "fixed") {
        return fixedValueText(option);
    }

    return rule.valueText;
}

// A fixed value ('é verdadeiro') is written in the rule's text, so the rule reads as `eq true`.
function fixedValueText({ valueInput }: OperatorOption): string {
    return valueInput.kind === "fixed" ? String(valueInput.value) : "";
}
