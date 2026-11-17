import { assertNever } from "@/lib/assert_never.js";
import type { Comparison, Condition } from "@/shared/conditions.js";
import type { ComparisonOperator, ComparisonValue } from "@/web/canvas/inspector/condition_text.js";

export type RuleConnective = "and" | "or";

export interface ConditionRule {
    path: string;
    operator: ComparisonOperator;
    valueText: string;
}

export interface ConditionRules {
    connective: RuleConnective;
    rules: ConditionRule[];
}

export type RulesConversion = { ok: true; condition: Condition } | { ok: false; error: string };

type ComparisonConversion = { ok: true; comparison: Comparison } | { ok: false; error: string };

const BOOLEAN_TEXTS = new Map([
    ["true", true],
    ["false", false],
]);

const LIST_VALUE_SEPARATOR = ", ";

export const MISSING_PATH_ERROR = "Informe o caminho de cada regra.";
export const NUMBER_REQUIRED_ERROR = "Use um número para comparar com > ou <.";

// Only a flat list of comparisons fits the rows; `not` and nested groups stay as they are.
export function toConditionRules(condition: Condition): ConditionRules | undefined {
    if (isComparison(condition)) {
        return { connective: "and", rules: [toRule(condition)] };
    }
    if (condition.op === "not" || !condition.conditions.every(isComparison)) {
        return undefined;
    }

    return { connective: condition.op, rules: condition.conditions.map(toRule) };
}

export function toCondition({ connective, rules }: ConditionRules): RulesConversion {
    const comparisons: Comparison[] = [];
    for (const rule of rules) {
        const conversion = toComparison(rule);
        if (!conversion.ok) {
            return conversion;
        }
        comparisons.push(conversion.comparison);
    }

    const [onlyComparison] = comparisons;
    if (onlyComparison && comparisons.length === 1) {
        return { ok: true, condition: onlyComparison };
    }

    return { ok: true, condition: { op: connective, conditions: comparisons } };
}

function isComparison(condition: Condition): condition is Comparison {
    return "path" in condition;
}

function toRule(comparison: Comparison): ConditionRule {
    return { path: comparison.path, operator: comparison.op, valueText: toValueText(comparison) };
}

function toValueText(comparison: Comparison): string {
    switch (comparison.op) {
        case "exists":
        case "isEmpty":
        case "isNotEmpty":
            return "";
        case "in":
            return comparison.values.join(LIST_VALUE_SEPARATOR);
        default:
            return String(comparison.value);
    }
}

function toComparison({ path, operator, valueText }: ConditionRule): ComparisonConversion {
    const trimmedPath = path.trim();
    if (trimmedPath === "") {
        return { ok: false, error: MISSING_PATH_ERROR };
    }

    switch (operator) {
        case "exists":
        case "isEmpty":
        case "isNotEmpty":
            return { ok: true, comparison: { op: operator, path: trimmedPath } };
        case "eq":
        case "neq":
            return {
                ok: true,
                comparison: { op: operator, path: trimmedPath, value: parseRuleValue(valueText) },
            };
        case "contains":
        case "notContains":
        case "startsWith":
            return { ok: true, comparison: { op: operator, path: trimmedPath, value: valueText } };
        case "in":
            return {
                ok: true,
                comparison: { op: operator, path: trimmedPath, values: parseListText(valueText) },
            };
        case "gt":
        case "lt":
        case "gte":
        case "lte":
        case "minLength":
            return toNumberComparison(operator, trimmedPath, valueText);
        default:
            return assertNever(operator);
    }
}

function parseListText(valueText: string): (string | number)[] {
    return valueText.split(LIST_VALUE_SEPARATOR.trim()).flatMap((text) => {
        const value = parseRuleValue(text.trim());
        return typeof value === "boolean" ? [] : [value];
    });
}

function toNumberComparison(
    operator: "gt" | "lt" | "gte" | "lte" | "minLength",
    path: string,
    valueText: string,
): ComparisonConversion {
    const value = parseRuleValue(valueText);
    if (typeof value !== "number") {
        return { ok: false, error: NUMBER_REQUIRED_ERROR };
    }

    return { ok: true, comparison: { op: operator, path, value } };
}

// Typed values follow JSON: `true`/`false` are booleans, numerals are numbers, anything else is text.
function parseRuleValue(valueText: string): ComparisonValue {
    const trimmedText = valueText.trim();
    const booleanValue = BOOLEAN_TEXTS.get(trimmedText);
    if (booleanValue !== undefined) {
        return booleanValue;
    }

    const numberValue = Number(trimmedText);
    if (trimmedText !== "" && Number.isFinite(numberValue)) {
        return numberValue;
    }

    return valueText;
}
