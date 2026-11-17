import type { DataField } from "@/engine/available_data.js";
import { assertNever } from "@/lib/assert_never.js";
import type { ValueInput } from "@/web/canvas/inspector/condition_operators.js";
import type { RuleValueFields } from "@/web/canvas/inspector/condition_rules.js";
import type { ComparisonValue } from "@/web/canvas/inspector/condition_text.js";

export type RuleValue =
    | { kind: "none" }
    | { kind: "single"; value: ComparisonValue }
    | { kind: "list"; values: (string | number)[] };

type ValueReading = { ok: true; value: RuleValue } | { ok: false; error: string };

const BOOLEAN_TEXTS = new Map([
    ["true", true],
    ["false", false],
]);
const LIST_VALUE_SEPARATOR = ",";
const NO_VALUE: RuleValue = { kind: "none" };

export const NUMBER_REQUIRED_ERROR = "Use um número nesta comparação.";
export const CHOICE_REQUIRED_ERROR = "Escolha ao menos uma das opções.";

/** The value of the rule, read the way the chosen operator asks for it. */
export function readRuleValue(
    valueInput: ValueInput,
    { valueText, values }: RuleValueFields,
    field: DataField | undefined,
): ValueReading {
    switch (valueInput.kind) {
        case "none":
            return { ok: true, value: NO_VALUE };
        case "fixed":
            return readSingleValue(valueInput.value);
        case "number":
            return readNumber(valueText);
        case "text":
            return readSingleValue(valueText);
        case "typed":
            return readSingleValue(parseTypedValue(valueText));
        case "typedList":
            return readValueList(parseTypedList(valueText));
        case "enumChoice":
            return readEnumChoice(valueText, field?.enumValues ?? []);
        case "enumChoices":
            return readValueList(values);
        default:
            return assertNever(valueInput);
    }
}

function readSingleValue(value: ComparisonValue): ValueReading {
    return { ok: true, value: { kind: "single", value } };
}

function readNumber(valueText: string): ValueReading {
    const value = parseTypedValue(valueText);
    if (typeof value !== "number") {
        return { ok: false, error: NUMBER_REQUIRED_ERROR };
    }

    return readSingleValue(value);
}

function readValueList(values: (string | number)[]): ValueReading {
    if (values.length === 0) {
        return { ok: false, error: CHOICE_REQUIRED_ERROR };
    }

    return { ok: true, value: { kind: "list", values } };
}

// The enum value keeps its own type: "42" stays text when the enum lists the text "42".
function readEnumChoice(valueText: string, enumValues: (string | number)[]): ValueReading {
    const chosenValue = enumValues.find((enumValue) => String(enumValue) === valueText);
    if (chosenValue === undefined) {
        return { ok: false, error: CHOICE_REQUIRED_ERROR };
    }

    return readSingleValue(chosenValue);
}

function parseTypedList(valueText: string): (string | number)[] {
    return valueText.split(LIST_VALUE_SEPARATOR).flatMap((text) => {
        const trimmedText = text.trim();
        return trimmedText === "" ? [] : [parseListedValue(trimmedText)];
    });
}

function parseListedValue(text: string): string | number {
    const value = parseTypedValue(text);
    return typeof value === "boolean" ? text : value;
}

// Typed values follow JSON: `true`/`false` are booleans, numerals are numbers, anything else is text.
function parseTypedValue(valueText: string): ComparisonValue {
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
