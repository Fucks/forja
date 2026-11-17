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

describe("evaluateCondition with the typed operators", () => {
    const pullRequest = {
        title: "fix: login",
        labels: ["urgent", "bug"],
        score: 7,
        status: "approved",
        notes: "",
        files: [],
        metadata: {},
        reviewer: null,
        approved: true,
    };

    it("compares numbers with gte and lte, including the limit", () => {
        expect(evaluateCondition({ op: "gte", path: "score", value: 7 }, pullRequest)).toBe(true);
        expect(evaluateCondition({ op: "gte", path: "score", value: 8 }, pullRequest)).toBe(false);
        expect(evaluateCondition({ op: "lte", path: "score", value: 7 }, pullRequest)).toBe(true);
        expect(evaluateCondition({ op: "lte", path: "score", value: 6 }, pullRequest)).toBe(false);
    });

    it("finds a substring of a text with contains and notContains", () => {
        expect(
            evaluateCondition({ op: "contains", path: "title", value: "login" }, pullRequest),
        ).toBe(true);
        expect(
            evaluateCondition({ op: "notContains", path: "title", value: "login" }, pullRequest),
        ).toBe(false);
        expect(
            evaluateCondition({ op: "notContains", path: "title", value: "logout" }, pullRequest),
        ).toBe(true);
    });

    it("finds an element of a list with contains and notContains", () => {
        expect(
            evaluateCondition({ op: "contains", path: "labels", value: "urgent" }, pullRequest),
        ).toBe(true);
        expect(
            evaluateCondition({ op: "contains", path: "labels", value: "urg" }, pullRequest),
        ).toBe(false);
        expect(
            evaluateCondition({ op: "notContains", path: "labels", value: "docs" }, pullRequest),
        ).toBe(true);
    });

    it("checks the beginning of a text with startsWith", () => {
        expect(
            evaluateCondition({ op: "startsWith", path: "title", value: "fix:" }, pullRequest),
        ).toBe(true);
        expect(
            evaluateCondition({ op: "startsWith", path: "title", value: "feat:" }, pullRequest),
        ).toBe(false);
    });

    it("compares with each of the values with in", () => {
        expect(
            evaluateCondition(
                { op: "in", path: "status", values: ["approved", "merged"] },
                pullRequest,
            ),
        ).toBe(true);
        expect(evaluateCondition({ op: "in", path: "score", values: ["7", 8] }, pullRequest)).toBe(
            false,
        );
    });

    it("treats empty texts, lists, objects and null as empty", () => {
        for (const path of ["notes", "files", "metadata", "reviewer"]) {
            expect(evaluateCondition({ op: "isEmpty", path }, pullRequest)).toBe(true);
            expect(evaluateCondition({ op: "isNotEmpty", path }, pullRequest)).toBe(false);
        }
        expect(evaluateCondition({ op: "isEmpty", path: "title" }, pullRequest)).toBe(false);
        expect(evaluateCondition({ op: "isNotEmpty", path: "labels" }, pullRequest)).toBe(true);
    });

    it("treats a missing path as empty", () => {
        expect(evaluateCondition({ op: "isEmpty", path: "missing" }, pullRequest)).toBe(true);
        expect(evaluateCondition({ op: "isNotEmpty", path: "missing" }, pullRequest)).toBe(false);
    });

    it("checks the length of a text or a list with minLength", () => {
        expect(evaluateCondition({ op: "minLength", path: "labels", value: 2 }, pullRequest)).toBe(
            true,
        );
        expect(evaluateCondition({ op: "minLength", path: "labels", value: 3 }, pullRequest)).toBe(
            false,
        );
        expect(evaluateCondition({ op: "minLength", path: "title", value: 10 }, pullRequest)).toBe(
            true,
        );
    });

    it("treats the typed operators on a value of the wrong type as false", () => {
        const wrongTypeConditions: Condition[] = [
            { op: "gte", path: "title", value: 1 },
            { op: "lte", path: "approved", value: 1 },
            { op: "contains", path: "approved", value: "true" },
            { op: "notContains", path: "score", value: "7" },
            { op: "startsWith", path: "labels", value: "urgent" },
            { op: "isEmpty", path: "approved" },
            { op: "isNotEmpty", path: "score" },
            { op: "minLength", path: "approved", value: 1 },
        ];

        for (const condition of wrongTypeConditions) {
            expect(evaluateCondition(condition, pullRequest)).toBe(false);
        }
    });

    it("is false for the typed operators on a missing path, except isEmpty", () => {
        const missingPathConditions: Condition[] = [
            { op: "gte", path: "missing", value: 1 },
            { op: "lte", path: "missing", value: 1 },
            { op: "contains", path: "missing", value: "a" },
            { op: "notContains", path: "missing", value: "a" },
            { op: "startsWith", path: "missing", value: "a" },
            { op: "in", path: "missing", values: ["a"] },
            { op: "minLength", path: "missing", value: 0 },
        ];

        for (const condition of missingPathConditions) {
            expect(evaluateCondition(condition, pullRequest)).toBe(false);
        }
    });
});

describe("conditionSchema", () => {
    it("accepts every typed operator", () => {
        const typedOperators: Condition[] = [
            { op: "gte", path: "score", value: 7 },
            { op: "lte", path: "score", value: 7 },
            { op: "contains", path: "labels", value: "urgent" },
            { op: "notContains", path: "labels", value: "urgent" },
            { op: "startsWith", path: "title", value: "fix" },
            { op: "in", path: "status", values: ["approved", 1] },
            { op: "isEmpty", path: "notes" },
            { op: "isNotEmpty", path: "notes" },
            { op: "minLength", path: "labels", value: 2 },
        ];

        for (const condition of typedOperators) {
            expect(conditionSchema.parse(condition)).toEqual(condition);
        }
    });

    it("rejects in without a list of values", () => {
        const result = conditionSchema.safeParse({ op: "in", path: "status", value: "approved" });

        expect(result.success).toBe(false);
    });

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
