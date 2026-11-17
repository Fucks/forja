import type { DataField } from "@/engine/available_data.js";
import { conditionToSentence, conditionToText } from "@/web/canvas/inspector/condition_text.js";

describe("conditionToText", () => {
    it("writes an equality with the value as typed", () => {
        const text = conditionToText({ op: "eq", path: "review.approved", value: true });

        expect(text).toBe("review.approved = true");
    });

    it("quotes text values", () => {
        const text = conditionToText({ op: "neq", path: "review.state", value: "rejected" });

        expect(text).toBe('review.state ≠ "rejected"');
    });

    it("writes the greater-than and less-than comparisons", () => {
        const greaterThan = conditionToText({ op: "gt", path: "tests.passed", value: 0 });
        const lessThan = conditionToText({ op: "lt", path: "review.round", value: 3 });

        expect(greaterThan).toBe("tests.passed > 0");
        expect(lessThan).toBe("review.round < 3");
    });

    it("says when a path must exist", () => {
        const text = conditionToText({ op: "exists", path: "tests.failures" });

        expect(text).toBe("tests.failures existe");
    });

    it("writes the typed comparisons with their symbols", () => {
        const texts = [
            conditionToText({ op: "gte", path: "review.score", value: 7 }),
            conditionToText({ op: "lte", path: "review.round", value: 3 }),
            conditionToText({ op: "contains", path: "item.labels", value: "urgent" }),
            conditionToText({ op: "notContains", path: "item.title", value: "WIP" }),
            conditionToText({ op: "startsWith", path: "item.title", value: "fix" }),
            conditionToText({ op: "minLength", path: "item.labels", value: 2 }),
        ];

        expect(texts).toEqual([
            "review.score ≥ 7",
            "review.round ≤ 3",
            'item.labels contém "urgent"',
            'item.title não contém "WIP"',
            'item.title começa com "fix"',
            "item.labels tem pelo menos 2",
        ]);
    });

    it("lists the values of an in comparison", () => {
        const text = conditionToText({ op: "in", path: "review.state", values: ["approved", 1] });

        expect(text).toBe('review.state em ["approved",1]');
    });

    it("writes the emptiness checks without a value", () => {
        const empty = conditionToText({ op: "isEmpty", path: "review.notes" });
        const notEmpty = conditionToText({ op: "isNotEmpty", path: "review.notes" });

        expect(empty).toBe("review.notes está vazio");
        expect(notEmpty).toBe("review.notes não está vazio");
    });

    it("joins the rules of an and with E", () => {
        const text = conditionToText({
            op: "and",
            conditions: [
                { op: "eq", path: "review.approved", value: true },
                { op: "eq", path: "tests.exitCode", value: 0 },
            ],
        });

        expect(text).toBe("review.approved = true E tests.exitCode = 0");
    });

    it("joins the rules of an or with OU", () => {
        const text = conditionToText({
            op: "or",
            conditions: [
                { op: "exists", path: "review.notes" },
                { op: "lt", path: "review.round", value: 2 },
            ],
        });

        expect(text).toBe("review.notes existe OU review.round < 2");
    });

    it("negates the inner condition", () => {
        const text = conditionToText({
            op: "not",
            condition: { op: "exists", path: "tests.failures" },
        });

        expect(text).toBe("NÃO (tests.failures existe)");
    });

    it("wraps nested combinations in parentheses", () => {
        const text = conditionToText({
            op: "and",
            conditions: [
                { op: "gt", path: "tests.passed", value: 0 },
                {
                    op: "or",
                    conditions: [
                        { op: "neq", path: "review.state", value: "rejected" },
                        { op: "lt", path: "review.round", value: 3 },
                    ],
                },
            ],
        });

        expect(text).toBe('tests.passed > 0 E (review.state ≠ "rejected" OU review.round < 3)');
    });
});

describe("conditionToSentence", () => {
    const approved: DataField = {
        path: "nodes.reviewer.result.approved",
        label: "Reviewer › approved",
        type: "boolean",
        depth: 1,
    };
    const labels: DataField = {
        path: "item.labels",
        label: "Item atual › labels",
        type: "list",
        depth: 0,
    };
    const state: DataField = {
        path: "nodes.reviewer.result.state",
        label: "Reviewer › state",
        type: "string",
        enumValues: ["approved", "rejected"],
        depth: 1,
    };

    it("reads a yes/no comparison with the field's label", () => {
        const sentence = conditionToSentence({ op: "eq", path: approved.path, value: true }, [
            approved,
        ]);

        expect(sentence).toBe("Se Reviewer › approved é verdadeiro");
    });

    it("joins the rules with 'e' and 'ou'", () => {
        const sentence = conditionToSentence(
            {
                op: "or",
                conditions: [
                    { op: "eq", path: approved.path, value: false },
                    { op: "contains", path: labels.path, value: "urgente" },
                ],
            },
            [approved, labels],
        );

        expect(sentence).toBe(
            'Se Reviewer › approved é falso ou Item atual › labels contém "urgente"',
        );
    });

    it("lists the values of 'é um de'", () => {
        const sentence = conditionToSentence(
            { op: "in", path: state.path, values: ["approved", "rejected"] },
            [state],
        );

        expect(sentence).toBe('Se Reviewer › state é um de "approved", "rejected"');
    });

    it("uses the words of the field's type", () => {
        const sentence = conditionToSentence({ op: "isEmpty", path: labels.path }, [labels]);

        expect(sentence).toBe("Se Item atual › labels está vazia");
    });

    it("writes the path when the field is unknown", () => {
        const sentence = conditionToSentence(
            {
                op: "and",
                conditions: [
                    { op: "gte", path: "inputs.value.score", value: 7 },
                    { op: "not", condition: { op: "exists", path: "inputs.value.notes" } },
                ],
            },
            [],
        );

        expect(sentence).toBe("Se inputs.value.score ≥ 7 e inputs.value.notes não existe");
    });

    it("negates and groups the conditions the rules cannot express", () => {
        const sentence = conditionToSentence(
            {
                op: "not",
                condition: {
                    op: "or",
                    conditions: [
                        { op: "eq", path: "a", value: "x" },
                        { op: "lt", path: "b", value: 2 },
                    ],
                },
            },
            [],
        );

        expect(sentence).toBe('Se não (a = "x" ou b < 2)');
    });
});
