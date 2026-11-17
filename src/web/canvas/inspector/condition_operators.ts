import type { DataField, DataType } from "@/engine/available_data.js";
import type { ComparisonOperator } from "@/shared/conditions.js";

/** A comparison of the rule; `notExists` is written as `not` of `exists`. */
export type RuleOperator = ComparisonOperator | "notExists";

/** How the rule's value is filled in once the operator is chosen. */
export type ValueInput =
    | { kind: "none" }
    | { kind: "fixed"; value: boolean }
    | { kind: "number" }
    | { kind: "text" }
    | { kind: "typed" }
    | { kind: "typedList" }
    | { kind: "enumChoice" }
    | { kind: "enumChoices" };

export interface OperatorOption {
    id: string;
    label: string;
    operator: RuleOperator;
    valueInput: ValueInput;
}

const NO_VALUE: ValueInput = { kind: "none" };
const NUMBER_VALUE: ValueInput = { kind: "number" };
const TEXT_VALUE: ValueInput = { kind: "text" };

const IS_TRUE: OperatorOption = {
    id: "isTrue",
    label: "é verdadeiro",
    operator: "eq",
    valueInput: { kind: "fixed", value: true },
};
const IS_FALSE: OperatorOption = {
    id: "isFalse",
    label: "é falso",
    operator: "eq",
    valueInput: { kind: "fixed", value: false },
};
const NUMBER_COMPARISONS: OperatorOption[] = [
    { id: "gt", label: ">", operator: "gt", valueInput: NUMBER_VALUE },
    { id: "gte", label: "≥", operator: "gte", valueInput: NUMBER_VALUE },
    { id: "lt", label: "<", operator: "lt", valueInput: NUMBER_VALUE },
    { id: "lte", label: "≤", operator: "lte", valueInput: NUMBER_VALUE },
];
const TEXT_SEARCHES: OperatorOption[] = [
    { id: "contains", label: "contém", operator: "contains", valueInput: TEXT_VALUE },
    { id: "notContains", label: "não contém", operator: "notContains", valueInput: TEXT_VALUE },
    { id: "startsWith", label: "começa com", operator: "startsWith", valueInput: TEXT_VALUE },
];
const EMPTINESS_CHECKS: OperatorOption[] = [
    { id: "isEmpty", label: "está vazio", operator: "isEmpty", valueInput: NO_VALUE },
    { id: "isNotEmpty", label: "não está vazio", operator: "isNotEmpty", valueInput: NO_VALUE },
];
const MIN_LENGTH: OperatorOption = {
    id: "minLength",
    label: "tem pelo menos",
    operator: "minLength",
    valueInput: NUMBER_VALUE,
};
const PRESENCE_CHECKS: OperatorOption[] = [
    { id: "exists", label: "existe", operator: "exists", valueInput: NO_VALUE },
    { id: "notExists", label: "não existe", operator: "notExists", valueInput: NO_VALUE },
];

const OPERATORS_BY_TYPE: Record<DataType, OperatorOption[]> = {
    boolean: [IS_TRUE, IS_FALSE],
    number: [
        { id: "eq", label: "=", operator: "eq", valueInput: NUMBER_VALUE },
        { id: "neq", label: "≠", operator: "neq", valueInput: NUMBER_VALUE },
        ...NUMBER_COMPARISONS,
    ],
    string: [
        { id: "eq", label: "é igual a", operator: "eq", valueInput: TEXT_VALUE },
        { id: "neq", label: "é diferente de", operator: "neq", valueInput: TEXT_VALUE },
        ...TEXT_SEARCHES,
        ...EMPTINESS_CHECKS,
    ],
    list: [
        { id: "isEmpty", label: "está vazia", operator: "isEmpty", valueInput: NO_VALUE },
        { id: "isNotEmpty", label: "não está vazia", operator: "isNotEmpty", valueInput: NO_VALUE },
        { id: "contains", label: "contém", operator: "contains", valueInput: TEXT_VALUE },
        MIN_LENGTH,
    ],
    object: PRESENCE_CHECKS,
    any: PRESENCE_CHECKS,
};

const ENUM_VALUE_TYPES: ReadonlySet<DataType> = new Set(["string", "number"]);
const ENUM_OPERATORS: OperatorOption[] = [
    { id: "eq", label: "é", operator: "eq", valueInput: { kind: "enumChoice" } },
    { id: "neq", label: "não é", operator: "neq", valueInput: { kind: "enumChoice" } },
    { id: "in", label: "é um de", operator: "in", valueInput: { kind: "enumChoices" } },
];

// Without a known type, any comparison may make sense, so the values are typed by hand.
const UNKNOWN_TYPE_OPERATORS: OperatorOption[] = [
    IS_TRUE,
    IS_FALSE,
    { id: "eq", label: "=", operator: "eq", valueInput: { kind: "typed" } },
    { id: "neq", label: "≠", operator: "neq", valueInput: { kind: "typed" } },
    ...NUMBER_COMPARISONS,
    ...TEXT_SEARCHES,
    { id: "in", label: "é um de", operator: "in", valueInput: { kind: "typedList" } },
    ...EMPTINESS_CHECKS,
    MIN_LENGTH,
    ...PRESENCE_CHECKS,
];

/** The operators that make sense for a value of the type, in the order they are offered. */
export function operatorsFor(
    type: DataType,
    { hasEnumValues = false }: { hasEnumValues?: boolean } = {},
): OperatorOption[] {
    if (hasEnumValues && ENUM_VALUE_TYPES.has(type)) {
        return ENUM_OPERATORS;
    }

    return OPERATORS_BY_TYPE[type];
}

/** The operators of a rule that reads the field; a path outside the known fields gets them all. */
export function operatorsForField(field: DataField | undefined): OperatorOption[] {
    if (!field) {
        return UNKNOWN_TYPE_OPERATORS;
    }

    return operatorsFor(field.type, { hasEnumValues: (field.enumValues ?? []).length > 0 });
}

/** The option that writes the rule, telling 'é verdadeiro' apart from other equalities. */
export function findOperatorOption(
    options: OperatorOption[],
    rule: { operator: RuleOperator; valueText: string },
): OperatorOption | undefined {
    return options.find(
        (option) => option.operator === rule.operator && acceptsValueText(option, rule.valueText),
    );
}

function acceptsValueText({ valueInput }: OperatorOption, valueText: string): boolean {
    return valueInput.kind !== "fixed" || String(valueInput.value) === valueText.trim();
}

/** The comparison the rule writes; 'não existe' is a negated `exists`, so it fits where `exists` does. */
export function toComparisonOperator(operator: RuleOperator): ComparisonOperator {
    return operator === "notExists" ? "exists" : operator;
}
