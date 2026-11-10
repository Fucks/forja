import { assertNever } from "@/lib/assert_never.js";
import type { Condition } from "@/shared/conditions.js";

type Combination = Extract<Condition, { conditions: Condition[] }>;
type ComparisonValue = Extract<Condition, { op: "eq" | "neq" }>["value"];

const COMBINATION_CONNECTIVES: Record<Combination["op"], string> = {
    and: " E ",
    or: " OU ",
};
const NEGATION_WORD = "NÃO";

export function conditionToText(condition: Condition): string {
    switch (condition.op) {
        case "eq":
            return `${condition.path} = ${formatComparisonValue(condition.value)}`;
        case "neq":
            return `${condition.path} ≠ ${formatComparisonValue(condition.value)}`;
        case "gt":
            return `${condition.path} > ${condition.value}`;
        case "lt":
            return `${condition.path} < ${condition.value}`;
        case "exists":
            return `${condition.path} existe`;
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

function describeOperand(operand: Condition): string {
    const isCombination = operand.op === "and" || operand.op === "or";

    return isCombination ? `(${conditionToText(operand)})` : conditionToText(operand);
}

function formatComparisonValue(value: ComparisonValue): string {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
}
