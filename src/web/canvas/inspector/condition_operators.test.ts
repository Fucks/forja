import type { DataField, DataType } from "@/engine/available_data.js";
import { describeOperatorTypeMismatch } from "@/engine/validation_rules/condition_rules.js";
import {
    findOperatorOption,
    operatorsFor,
    operatorsForField,
} from "@/web/canvas/inspector/condition_operators.js";
import type { OperatorOption } from "@/web/canvas/inspector/condition_operators.js";

const REVIEW_STATE: DataField = {
    path: "nodes.reviewer.result.state",
    label: "Reviewer › Resultado › state",
    type: "string",
    enumValues: ["approved", "rejected"],
    depth: 1,
};

describe("operatorsFor", () => {
    it.each<[DataType, string[]]>([
        ["boolean", ["é verdadeiro", "é falso"]],
        ["number", ["=", "≠", ">", "≥", "<", "≤"]],
        [
            "string",
            [
                "é igual a",
                "é diferente de",
                "contém",
                "não contém",
                "começa com",
                "está vazio",
                "não está vazio",
            ],
        ],
        ["list", ["está vazia", "não está vazia", "contém", "tem pelo menos"]],
        ["object", ["existe", "não existe"]],
        ["any", ["existe", "não existe"]],
    ])("offers the operators that fit a %s", (type, expectedLabels) => {
        const options = operatorsFor(type);

        expect(labelsOf(options)).toEqual(expectedLabels);
    });

    it.each<DataType>(["boolean", "number", "string", "list", "object"])(
        "offers only operators the flow validation accepts for a %s",
        (type) => {
            const options = [...operatorsFor(type), ...operatorsFor(type, { hasEnumValues: true })];

            const mismatches = options.map(({ operator }) =>
                describeOperatorTypeMismatch(operator === "notExists" ? "exists" : operator, type),
            );

            expect(mismatches.filter((mismatch) => mismatch !== undefined)).toEqual([]);
        },
    );

    it("offers the usual operators of a list even when its schema lists values", () => {
        const options = operatorsFor("list", { hasEnumValues: true });

        expect(options).toEqual(operatorsFor("list"));
    });

    it("offers the enum operators for a text with a closed list of values", () => {
        const options = operatorsFor("string", { hasEnumValues: true });

        expect(labelsOf(options)).toEqual(["é", "não é", "é um de"]);
    });

    it("compares a boolean with a fixed value, so the rule asks for no value", () => {
        const [isTrue, isFalse] = operatorsFor("boolean");

        expect(isTrue).toMatchObject({
            operator: "eq",
            valueInput: { kind: "fixed", value: true },
        });
        expect(isFalse).toMatchObject({
            operator: "eq",
            valueInput: { kind: "fixed", value: false },
        });
    });

    it("offers 'é um de' as a choice of many enum values", () => {
        const options = operatorsFor("string", { hasEnumValues: true });

        expect(options.find((option) => option.operator === "in")?.valueInput).toEqual({
            kind: "enumChoices",
        });
    });
});

describe("operatorsForField", () => {
    it("offers the enum operators for a field with enum values", () => {
        const options = operatorsForField(REVIEW_STATE);

        expect(labelsOf(options)).toEqual(["é", "não é", "é um de"]);
    });

    it("offers every operator for a path whose type is unknown", () => {
        const options = operatorsForField(undefined);

        expect(labelsOf(options)).toEqual([
            "é verdadeiro",
            "é falso",
            "=",
            "≠",
            ">",
            "≥",
            "<",
            "≤",
            "contém",
            "não contém",
            "começa com",
            "é um de",
            "está vazio",
            "não está vazio",
            "tem pelo menos",
            "existe",
            "não existe",
        ]);
    });
});

describe("findOperatorOption", () => {
    it("recognizes an equality with true as 'é verdadeiro'", () => {
        const option = findOperatorOption(operatorsFor("boolean"), {
            operator: "eq",
            valueText: "true",
        });

        expect(option?.label).toBe("é verdadeiro");
    });

    it("recognizes an equality with another value as '=' when the type is unknown", () => {
        const option = findOperatorOption(operatorsForField(undefined), {
            operator: "eq",
            valueText: "0",
        });

        expect(option?.label).toBe("=");
    });

    it("finds nothing for an operator the type does not offer", () => {
        const option = findOperatorOption(operatorsFor("boolean"), {
            operator: "contains",
            valueText: "a",
        });

        expect(option).toBeUndefined();
    });
});

function labelsOf(options: OperatorOption[]): string[] {
    return options.map((option) => option.label);
}
