import type { DataField } from "@/engine/available_data.js";
import { assertNever } from "@/lib/assert_never.js";
import type { Comparison, Condition } from "@/shared/conditions.js";
import {
    findOperatorOption,
    operatorsForField,
} from "@/web/canvas/inspector/condition_operators.js";
import type { OperatorOption, RuleOperator } from "@/web/canvas/inspector/condition_operators.js";
import { readRuleValue } from "@/web/canvas/inspector/condition_rule_values.js";
import type { RuleValue } from "@/web/canvas/inspector/condition_rule_values.js";

export type RuleConnective = "and" | "or";

/** One row of the editor: `valueText` holds what is typed, `values` the enum values chosen. */
export interface ConditionRule {
    path: string;
    operator: RuleOperator;
    valueText: string;
    values: (string | number)[];
}

export interface ConditionRules {
    connective: RuleConnective;
    rules: ConditionRule[];
}

export type RulesConversion = { ok: true; condition: Condition } | { ok: false; error: string };

type NotExists = { op: "not"; condition: { op: "exists"; path: string } };

/** A condition that fits one rule row. */
export type RuleCondition = Comparison | NotExists;

const LIST_VALUE_JOINER = ", ";

export const MISSING_PATH_ERROR = "Informe o caminho de cada regra.";
const VALUE_TYPE_ERROR = "O valor desta regra não serve para o operador escolhido.";

// Only a flat list of comparisons fits the rows; other `not`s and nested groups stay as they are.
export function toConditionRules(condition: Condition): ConditionRules | undefined {
    if (isRuleCondition(condition)) {
        return { connective: "and", rules: [toConditionRule(condition)] };
    }
    if (condition.op === "not" || !condition.conditions.every(isRuleCondition)) {
        return undefined;
    }

    return { connective: condition.op, rules: condition.conditions.map(toConditionRule) };
}

export function toCondition(
    { connective, rules }: ConditionRules,
    fields: DataField[],
): RulesConversion {
    const conditions: Condition[] = [];
    for (const rule of rules) {
        const conversion = toRuleCondition(rule, fields);
        if (!conversion.ok) {
            return conversion;
        }
        conditions.push(conversion.condition);
    }

    const [onlyCondition] = conditions;
    if (onlyCondition && conditions.length === 1) {
        return { ok: true, condition: onlyCondition };
    }

    return { ok: true, condition: { op: connective, conditions } };
}

/** The operators the rule can use; an operator that does not fit the field stays listed. */
export function listRuleOperatorOptions(
    rule: ConditionRule,
    fields: DataField[],
): OperatorOption[] {
    const options = operatorsForField(findRuleField(rule, fields));
    if (findOperatorOption(options, rule)) {
        return options;
    }

    const currentOption = findOperatorOption(operatorsForField(undefined), rule);
    return currentOption ? [...options, currentOption] : options;
}

export function findRuleField(rule: ConditionRule, fields: DataField[]): DataField | undefined {
    return fields.find((field) => field.path === rule.path.trim());
}

export function isRuleCondition(condition: Condition): condition is RuleCondition {
    return "path" in condition || isNotExists(condition);
}

function isNotExists(condition: Condition): condition is NotExists {
    return condition.op === "not" && condition.condition.op === "exists";
}

export function toConditionRule(condition: RuleCondition): ConditionRule {
    if (condition.op === "not") {
        return { path: condition.condition.path, operator: "notExists", valueText: "", values: [] };
    }

    const values = condition.op === "in" ? condition.values : [];
    return {
        path: condition.path,
        operator: condition.op,
        valueText: toValueText(condition),
        values,
    };
}

function toValueText(comparison: Comparison): string {
    switch (comparison.op) {
        case "exists":
        case "isEmpty":
        case "isNotEmpty":
            return "";
        case "in":
            return comparison.values.join(LIST_VALUE_JOINER);
        default:
            return String(comparison.value);
    }
}

function toRuleCondition(rule: ConditionRule, fields: DataField[]): RulesConversion {
    const path = rule.path.trim();
    if (path === "") {
        return { ok: false, error: MISSING_PATH_ERROR };
    }

    const field = findRuleField(rule, fields);
    const option = findOperatorOption(listRuleOperatorOptions(rule, fields), rule);
    if (!option) {
        return { ok: false, error: VALUE_TYPE_ERROR };
    }

    const reading = readRuleValue(option.valueInput, rule, field);
    if (!reading.ok) {
        return reading;
    }

    return buildRuleCondition(rule.operator, path, reading.value);
}

function buildRuleCondition(
    operator: RuleOperator,
    path: string,
    ruleValue: RuleValue,
): RulesConversion {
    const accepted = (condition: Condition): RulesConversion => ({ ok: true, condition });
    const value = ruleValue.kind === "single" ? ruleValue.value : undefined;

    switch (operator) {
        case "exists":
        case "isEmpty":
        case "isNotEmpty":
            return accepted({ op: operator, path });
        case "notExists":
            return accepted({ op: "not", condition: { op: "exists", path } });
        case "eq":
        case "neq":
            return value === undefined ? refused() : accepted({ op: operator, path, value });
        case "gt":
        case "gte":
        case "lt":
        case "lte":
        case "minLength":
            return typeof value === "number" ? accepted({ op: operator, path, value }) : refused();
        case "contains":
        case "notContains":
        case "startsWith":
            return typeof value === "string" ? accepted({ op: operator, path, value }) : refused();
        case "in":
            return ruleValue.kind === "list"
                ? accepted({ op: operator, path, values: ruleValue.values })
                : refused();
        default:
            return assertNever(operator);
    }
}

function refused(): RulesConversion {
    return { ok: false, error: VALUE_TYPE_ERROR };
}
