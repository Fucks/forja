import { type Condition, conditionSchema, evaluateCondition } from "@/shared/conditions.js";

const reviewOutputs = {
    review: { approved: true, score: 7, notes: null },
    tests: { exitCode: 0 },
};

describe("evaluateCondition", () => {
    it("checks equality with eq", () => {
        expect(
            evaluateCondition({ op: "eq", path: "review.approved", value: true }, reviewOutputs),
        ).toBe(true);
        expect(
            evaluateCondition({ op: "eq", path: "tests.exitCode", value: 1 }, reviewOutputs),
        ).toBe(false);
    });

    it("checks inequality with neq", () => {
        expect(
            evaluateCondition({ op: "neq", path: "tests.exitCode", value: 1 }, reviewOutputs),
        ).toBe(true);
        expect(
            evaluateCondition({ op: "neq", path: "tests.exitCode", value: 0 }, reviewOutputs),
        ).toBe(false);
    });

    it("compares numbers with gt and lt", () => {
        expect(evaluateCondition({ op: "gt", path: "review.score", value: 5 }, reviewOutputs)).toBe(
            true,
        );
        expect(evaluateCondition({ op: "lt", path: "review.score", value: 5 }, reviewOutputs)).toBe(
            false,
        );
    });

    it("treats gt and lt on a value that is not a number as false", () => {
        expect(
            evaluateCondition({ op: "gt", path: "review.approved", value: 0 }, reviewOutputs),
        ).toBe(false);
        expect(
            evaluateCondition({ op: "lt", path: "review.approved", value: 9 }, reviewOutputs),
        ).toBe(false);
    });

    it("checks presence with exists, including null values", () => {
        expect(evaluateCondition({ op: "exists", path: "review.notes" }, reviewOutputs)).toBe(true);
        expect(evaluateCondition({ op: "exists", path: "review.author" }, reviewOutputs)).toBe(
            false,
        );
    });

    it("requires every condition with and", () => {
        const approvedAndPassing: Condition = {
            op: "and",
            conditions: [
                { op: "eq", path: "review.approved", value: true },
                { op: "eq", path: "tests.exitCode", value: 0 },
            ],
        };
        const approvedAndFailing: Condition = {
            op: "and",
            conditions: [
                { op: "eq", path: "review.approved", value: true },
                { op: "eq", path: "tests.exitCode", value: 1 },
            ],
        };

        expect(evaluateCondition(approvedAndPassing, reviewOutputs)).toBe(true);
        expect(evaluateCondition(approvedAndFailing, reviewOutputs)).toBe(false);
    });

    it("requires any condition with or", () => {
        const failingOrApproved: Condition = {
            op: "or",
            conditions: [
                { op: "eq", path: "tests.exitCode", value: 1 },
                { op: "eq", path: "review.approved", value: true },
            ],
        };
        const failingOrRejected: Condition = {
            op: "or",
            conditions: [
                { op: "eq", path: "tests.exitCode", value: 1 },
                { op: "eq", path: "review.approved", value: false },
            ],
        };

        expect(evaluateCondition(failingOrApproved, reviewOutputs)).toBe(true);
        expect(evaluateCondition(failingOrRejected, reviewOutputs)).toBe(false);
    });

    it("negates the inner condition with not", () => {
        const notApproved: Condition = {
            op: "not",
            condition: { op: "eq", path: "review.approved", value: true },
        };

        expect(evaluateCondition(notApproved, reviewOutputs)).toBe(false);
    });

    it("is false for every comparison on a missing path", () => {
        const missingPath = "review.missing.deeper";

        expect(evaluateCondition({ op: "eq", path: missingPath, value: 1 }, reviewOutputs)).toBe(
            false,
        );
        expect(evaluateCondition({ op: "neq", path: missingPath, value: 1 }, reviewOutputs)).toBe(
            false,
        );
        expect(evaluateCondition({ op: "gt", path: missingPath, value: 1 }, reviewOutputs)).toBe(
            false,
        );
        expect(evaluateCondition({ op: "lt", path: missingPath, value: 1 }, reviewOutputs)).toBe(
            false,
        );
        expect(evaluateCondition({ op: "exists", path: missingPath }, reviewOutputs)).toBe(false);
    });

    it("is true for not of a missing path", () => {
        const notMissing: Condition = {
            op: "not",
            condition: { op: "eq", path: "review.missing", value: true },
        };

        expect(evaluateCondition(notMissing, reviewOutputs)).toBe(true);
    });

    it("treats a path through a non-object value as missing", () => {
        expect(
            evaluateCondition({ op: "exists", path: "tests.exitCode.code" }, reviewOutputs),
        ).toBe(false);
        expect(evaluateCondition({ op: "exists", path: "review" }, "not an object")).toBe(false);
    });
});

describe("conditionSchema", () => {
    it("accepts nested conditions", () => {
        const nested = {
            op: "and",
            conditions: [{ op: "not", condition: { op: "exists", path: "review.notes" } }],
        };

        expect(conditionSchema.parse(nested)).toEqual(nested);
    });

    it("rejects gt with a value that is not a number", () => {
        const result = conditionSchema.safeParse({ op: "gt", path: "tests.exitCode", value: "1" });

        expect(result.success).toBe(false);
    });

    it("rejects an unknown operator", () => {
        const result = conditionSchema.safeParse({ op: "matches", path: "review.notes" });

        expect(result.success).toBe(false);
    });
});
