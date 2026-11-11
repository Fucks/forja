import type { Condition } from "@/shared/conditions.js";
import {
    MISSING_PATH_ERROR,
    NUMBER_REQUIRED_ERROR,
    toCondition,
    toConditionRules,
} from "@/web/canvas/inspector/condition_rules.js";

const CONDITIONS_BEYOND_RULES: Condition[] = [
    { op: "not", condition: { op: "exists", path: "review.notes" } },
    {
        op: "and",
        conditions: [
            { op: "exists", path: "review.notes" },
            { op: "or", conditions: [{ op: "exists", path: "tests.result" }] },
        ],
    },
];

describe("toConditionRules", () => {
    it("turns a single comparison into one rule", () => {
        const rules = toConditionRules({ op: "eq", path: "review.approved", value: true });

        expect(rules).toEqual({
            connective: "and",
            rules: [{ path: "review.approved", operator: "eq", valueText: "true" }],
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
            rules: [
                { path: "tests.failed", operator: "gt", valueText: "0" },
                { path: "review.notes", operator: "exists", valueText: "" },
            ],
        });
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
        const conversion = toCondition({
            connective: "and",
            rules: [
                { path: "review.approved", operator: "eq", valueText: "true" },
                { path: "tests.exitCode", operator: "eq", valueText: "0" },
            ],
        });

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
        const conversion = toCondition({
            connective: "or",
            rules: [{ path: "review.notes", operator: "exists", valueText: "ignorado" }],
        });

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "exists", path: "review.notes" },
        });
    });

    it("keeps a value that is neither a boolean nor a number as text", () => {
        const conversion = toCondition({
            connective: "and",
            rules: [{ path: "review.verdict", operator: "neq", valueText: "rejeitado" }],
        });

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "neq", path: "review.verdict", value: "rejeitado" },
        });
    });

    it("keeps the text 'constructor' as text", () => {
        const conversion = toCondition({
            connective: "and",
            rules: [{ path: "review.verdict", operator: "eq", valueText: "constructor" }],
        });

        expect(conversion).toEqual({
            ok: true,
            condition: { op: "eq", path: "review.verdict", value: "constructor" },
        });
    });

    it("refuses a greater-than rule whose value is not a number", () => {
        const conversion = toCondition({
            connective: "and",
            rules: [{ path: "tests.failed", operator: "gt", valueText: "muitos" }],
        });

        expect(conversion).toEqual({ ok: false, error: NUMBER_REQUIRED_ERROR });
    });

    it("refuses a rule without a path", () => {
        const conversion = toCondition({
            connective: "and",
            rules: [{ path: "  ", operator: "exists", valueText: "" }],
        });

        expect(conversion).toEqual({ ok: false, error: MISSING_PATH_ERROR });
    });
});
