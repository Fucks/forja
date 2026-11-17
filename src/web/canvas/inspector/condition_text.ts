import type { DataField } from "@/engine/available_data.js";
import { assertNever } from "@/lib/assert_never.js";
import type { Comparison, Condition } from "@/shared/conditions.js";
import { findOperatorOption } from "@/web/canvas/inspector/condition_operators.js";
import {
    findRuleField,
    isRuleCondition,
    listRuleOperatorOptions,
    toConditionRule,
} from "@/web/canvas/inspector/condition_rules.js";
import type { RuleCondition } from "@/web/canvas/inspector/condition_rules.js";

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

/** A piece of the readable sentence; the data it reads is shown apart from the words. */
export interface SentencePart {
    text: string;
    isData: boolean;
}

const SENTENCE_START = "Se ";
const SENTENCE_CONNECTIVES: Record<Combination["op"], string> = {
    and: " e ",
    or: " ou ",
};
const SENTENCE_NEGATION = "não";
const SENTENCE_VALUE_SEPARATOR = ", ";

/** The condition as a sentence: "Se Reviewer › approved é verdadeiro". */
export function conditionToSentence(condition: Condition, fields: DataField[]): string {
    return conditionToSentenceParts(condition, fields)
        .map((part) => part.text)
        .join("");
}

export function conditionToSentenceParts(
    condition: Condition,
    fields: DataField[],
): SentencePart[] {
    return [words(SENTENCE_START), ...describeInWords(condition, fields)];
}

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

function describeInWords(condition: Condition, fields: DataField[]): SentencePart[] {
    if (isRuleCondition(condition)) {
        return describeRuleInWords(condition, fields);
    }

    switch (condition.op) {
        case "and":
        case "or":
            return joinParts(
                condition.conditions.map((operand) => describeOperandInWords(operand, fields)),
                words(SENTENCE_CONNECTIVES[condition.op]),
            );
        case "not":
            return [
                words(`${SENTENCE_NEGATION} (`),
                ...describeInWords(condition.condition, fields),
                words(")"),
            ];
        default:
            return assertNever(condition);
    }
}

function describeOperandInWords(operand: Condition, fields: DataField[]): SentencePart[] {
    const isCombination = operand.op === "and" || operand.op === "or";
    if (!isCombination) {
        return describeInWords(operand, fields);
    }

    return [words("("), ...describeInWords(operand, fields), words(")")];
}

// The operator reads as the editor offers it for the field, so the sentence and the rows agree.
function describeRuleInWords(condition: RuleCondition, fields: DataField[]): SentencePart[] {
    const rule = toConditionRule(condition);
    const field = findRuleField(rule, fields);
    const option = findOperatorOption(listRuleOperatorOptions(rule, fields), rule);
    const comparedValue =
        option?.valueInput.kind === "fixed" ? undefined : describeValueInWords(condition);
    const phrase = [option?.label ?? rule.operator, comparedValue]
        .filter((part) => part !== undefined)
        .join(" ");

    return [{ text: field?.label ?? rule.path, isData: true }, words(` ${phrase}`)];
}

function describeValueInWords(condition: RuleCondition): string | undefined {
    if (condition.op === "not") {
        return undefined;
    }
    if (condition.op === "in") {
        return condition.values.map(formatComparisonValue).join(SENTENCE_VALUE_SEPARATOR);
    }

    return describeComparedValue(condition);
}

function joinParts(groups: SentencePart[][], separator: SentencePart): SentencePart[] {
    return groups.flatMap((group, index) => (index === 0 ? group : [separator, ...group]));
}

function words(text: string): SentencePart {
    return { text, isData: false };
}
