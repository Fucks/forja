import type { Comparison, Condition } from "@/shared/conditions.js";

export type ComparisonOperator = Comparison["op"];
export type ComparisonValue = Extract<Comparison, { op: "eq" | "neq" }>["value"];
type Combination = Extract<Condition, { conditions: Condition[] }>;

export const COMPARISON_OPERATOR_SYMBOLS: Record<ComparisonOperator, string> = {
    eq: "=",
    neq: "≠",
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    contains: "contém",
    notContains: "não contém",
    startsWith: "começa com",
    in: "em",
    isEmpty: "está vazio",
    isNotEmpty: "não está vazio",
    minLength: "tem pelo menos",
    exists: "existe",
};
const COMBINATION_CONNECTIVES: Record<Combination["op"], string> = {
    and: " E ",
    or: " OU ",
};
const NEGATION_WORD = "NÃO";

export function conditionToText(condition: Condition): string {
    switch (condition.op) {
        case "and":
        case "or":
            return condition.conditions
                .map(describeOperand)
                .join(COMBINATION_CONNECTIVES[condition.op]);
        case "not":
            return `${NEGATION_WORD} (${conditionToText(condition.condition)})`;
        default:
            return describeComparison(condition);
    }
}

function describeComparison(comparison: Comparison): string {
    const parts = [
        comparison.path,
        COMPARISON_OPERATOR_SYMBOLS[comparison.op],
        describeComparedValue(comparison),
    ];

    return parts.filter((part) => part !== undefined).join(" ");
}

function describeComparedValue(comparison: Comparison): string | undefined {
    switch (comparison.op) {
        case "exists":
        case "isEmpty":
        case "isNotEmpty":
            return undefined;
        case "in":
            return JSON.stringify(comparison.values);
        default:
            return formatComparisonValue(comparison.value);
    }
}

function describeOperand(operand: Condition): string {
    const isCombination = operand.op === "and" || operand.op === "or";

    return isCombination ? `(${conditionToText(operand)})` : conditionToText(operand);
}

function formatComparisonValue(value: ComparisonValue): string {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
}
