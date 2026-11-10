import { assertNever } from "@/lib/assert_never.js";
import type { Condition } from "@/shared/conditions.js";

export type Comparison = Extract<Condition, { path: string }>;
export type ComparisonOperator = Comparison["op"];
type Combination = Extract<Condition, { conditions: Condition[] }>;
type ComparisonValue = Extract<Condition, { op: "eq" | "neq" }>["value"];

export const COMPARISON_OPERATOR_SYMBOLS: Record<ComparisonOperator, string> = {
    eq: "=",
    neq: "≠",
    gt: ">",
    lt: "<",
    exists: "existe",
};
const COMBINATION_CONNECTIVES: Record<Combination["op"], string> = {
    and: " E ",
    or: " OU ",
};
const NEGATION_WORD = "NÃO";

export function conditionToText(condition: Condition): string {
    switch (condition.op) {
        case "eq":
        case "neq":
        case "gt":
        case "lt":
        case "exists":
            return describeComparison(condition);
        case "and":
        case "or":
            return condition.conditions
                .map(describeOperand)
                .join(COMBINATION_CONNECTIVES[condition.op]);
        case "not":
            return `${NEGATION_WORD} (${conditionToText(condition.condition)})`;
        default:
            return assertNever(condition);
    }
}

function describeComparison(comparison: Comparison): string {
    const symbol = COMPARISON_OPERATOR_SYMBOLS[comparison.op];
    if (comparison.op === "exists") {
        return `${comparison.path} ${symbol}`;
    }

    return `${comparison.path} ${symbol} ${formatComparisonValue(comparison.value)}`;
}

function describeOperand(operand: Condition): string {
    const isCombination = operand.op === "and" || operand.op === "or";

    return isCombination ? `(${conditionToText(operand)})` : conditionToText(operand);
}

function formatComparisonValue(value: ComparisonValue): string {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
}
