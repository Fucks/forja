import type { DataField } from "@/engine/available_data.js";
import type { Condition } from "@/shared/conditions.js";
import type { RuleOperator } from "@/web/canvas/inspector/condition_operators.js";
import {
    CHOICE_REQUIRED_ERROR,
    NUMBER_REQUIRED_ERROR,
} from "@/web/canvas/inspector/condition_rule_values.js";
import {
    MISSING_PATH_ERROR,
    toCondition,
    toConditionRules,
} from "@/web/canvas/inspector/condition_rules.js";
import type { ConditionRule } from "@/web/canvas/inspector/condition_rules.js";

const CONDITIONS_BEYOND_RULES: Condition[] = [
    { op: "not", condition: { op: "eq", path: "review.approved", value: true } },
    {
        op: "and",
        conditions: [
            { op: "exists", path: "review.notes" },
            { op: "or", conditions: [{ op: "exists", path: "tests.result" }] },
        ],
    },
];

const REVIEW_NOTES: DataField = {
    path: "nodes.reviewer.result.notes",
    label: "Reviewer › Resultado › notes",
    type: "string",
    depth: 1,
};
const REVIEW_STATE: DataField = {
    path: "nodes.reviewer.result.state",
    label: "Reviewer › Resultado › state",
    type: "string",
    enumValues: ["approved", "rejected", "42"],
    depth: 1,
};

describe("toConditionRules", () => {
    it("turns a single comparison into one rule", () => {
        const rules = toConditionRules({ op: "eq", path: "review.approved", value: true });

        expect(rules).toEqual({
            connective: "and",
            rules: [buildRule("review.approved", "eq", "true")],
        });
    });

    it("turns an 'or' of comparisons into rules joined by OU", () => {
        const rules = toConditionRules({
            op: "or",
            conditions: [
                { op: "gt", path: "tests.failed", value: 0 },
                { op: "exists", path: "review.notes" },
            ],
        });

        expect(rules).toEqual({
            connective: "or",
            rules: [buildRule("tests.failed", "gt", "0"), buildRule("review.notes", "exists")],
        });
    });

    it("turns 'not exists' into a 'não existe' rule", () => {
        const rules = toConditionRules({
            op: "not",
            condition: { op: "exists", path: "review.notes" },
        });

        expect(rules?.rules).toEqual([buildRule("review.notes", "notExists")]);
    });

    it("keeps the values of an 'in' comparison", () => {
        const rules = toConditionRules({
            op: "in",
            path: "review.state",
            values: ["approved", 1],
        });

        expect(rules?.rules).toEqual([
            {
                path: "review.state",
                operator: "in",
                valueText: "approved, 1",
                values: ["approved", 1],
            },
        ]);
    });

    it.each(CONDITIONS_BEYOND_RULES)(
        "cannot express $op with nested conditions as rules",
        (condition) => {
            expect(toConditionRules(condition)).toBeUndefined();
        },
    );
});

describe("toCondition", () => {
    it("builds an 'and' of two rules", () => {
        const conversion = toCondition(
            {
                connective: "and",
                rules: [
                    buildRule("review.approved", "eq", "true"),
                    buildRule("tests.exitCode", "eq", "0"),
                ],
            },
            [],
        );

        expect(conversion).toEqual({
            ok: true,
            condition: {
                op: "and",
                conditions: [
                    { op: "eq", path: "review.approved", value: true },
                    { op: "eq", path: "tests.exitCode", value: 0 },
                ],
            },
        });
    });

    it("keeps a single rule as a plain comparison", () => {
        const conversion = convertRule(buildRule("review.notes", "exists", "ignorado"));

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "exists", path: "review.notes" },
        });
    });

    it("writes a 'não existe' rule as not exists", () => {
        const conversion = convertRule(buildRule("review.notes", "notExists"));

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "not", condition: { op: "exists", path: "review.notes" } },
        });
    });

    it("keeps a value that is neither a boolean nor a number as text", () => {
        const conversion = convertRule(buildRule("review.verdict", "neq", "rejeitado"));

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "neq", path: "review.verdict", value: "rejeitado" },
        });
    });

    it("keeps the text 'constructor' as text", () => {
        const conversion = convertRule(buildRule("review.verdict", "eq", "constructor"));

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "eq", path: "review.verdict", value: "constructor" },
        });
    });

    it("keeps a number typed for a text field as text", () => {
        const conversion = convertRule(buildRule(REVIEW_NOTES.path, "eq", "123"), [REVIEW_NOTES]);

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "eq", path: REVIEW_NOTES.path, value: "123" },
        });
    });

    it("writes the chosen enum value with its own type", () => {
        const conversion = convertRule(buildRule(REVIEW_STATE.path, "eq", "42"), [REVIEW_STATE]);

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "eq", path: REVIEW_STATE.path, value: "42" },
        });
    });

    it("writes the enum values chosen for 'é um de'", () => {
        const rule: ConditionRule = {
            ...buildRule(REVIEW_STATE.path, "in"),
            values: ["approved", "rejected"],
        };

        const conversion = convertRule(rule, [REVIEW_STATE]);

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "in", path: REVIEW_STATE.path, values: ["approved", "rejected"] },
        });
    });

    it("refuses 'é um de' without any chosen value", () => {
        const conversion = convertRule(buildRule(REVIEW_STATE.path, "in"), [REVIEW_STATE]);

        expect(conversion).toEqual({ ok: false, error: CHOICE_REQUIRED_ERROR });
    });

    it("reads the values typed for 'é um de' on a path of unknown type", () => {
        const conversion = convertRule(buildRule("review.state", "in", "approved, 1"));

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "in", path: "review.state", values: ["approved", 1] },
        });
    });

    it("refuses a greater-than rule whose value is not a number", () => {
        const conversion = convertRule(buildRule("tests.failed", "gt", "muitos"));

        expect(conversion).toEqual({ ok: false, error: NUMBER_REQUIRED_ERROR });
    });

    it("refuses a rule without a path", () => {
        const conversion = convertRule(buildRule("  ", "exists"));

        expect(conversion).toEqual({ ok: false, error: MISSING_PATH_ERROR });
    });
});

function buildRule(path: string, operator: RuleOperator, valueText = ""): ConditionRule {
    return { path, operator, valueText, values: [] };
}

function convertRule(
    rule: ConditionRule,
    fields: DataField[] = [],
): ReturnType<typeof toCondition> {
    return toCondition({ connective: "and", rules: [rule] }, fields);
}
