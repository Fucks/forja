import { conditionToText } from "@/web/canvas/inspector/condition_text.js";

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
