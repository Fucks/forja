import { jsonSchemaToZod } from "@/integrations/agent_runtime/output_schema.js";

const REVIEW_SCHEMA = {
    type: "object",
    properties: {
        verdict: { type: "string", enum: ["approve", "request_changes"] },
        score: { type: "integer" },
        confidence: { type: "number" },
        blocking: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
    },
    required: ["verdict", "issues"],
};

function accepts(schema: Record<string, unknown>, candidate: unknown): boolean {
    return jsonSchemaToZod(schema).safeParse(candidate).success;
}

describe("jsonSchemaToZod", () => {
    it("accepts an output that follows the schema", () => {
        const output = {
            verdict: "approve",
            score: 8,
            confidence: 0.9,
            blocking: false,
            issues: ["nome confuso"],
        };

        expect(accepts(REVIEW_SCHEMA, output)).toBe(true);
    });

    it("accepts an output without the optional properties", () => {
        expect(accepts(REVIEW_SCHEMA, { verdict: "approve", issues: [] })).toBe(true);
    });

    it("rejects an output missing a required property", () => {
        expect(accepts(REVIEW_SCHEMA, { verdict: "approve" })).toBe(false);
    });

    it("rejects a value outside the enum", () => {
        expect(accepts(REVIEW_SCHEMA, { verdict: "maybe", issues: [] })).toBe(false);
    });

    it("rejects a fractional number where an integer is expected", () => {
        expect(accepts(REVIEW_SCHEMA, { verdict: "approve", issues: [], score: 7.5 })).toBe(false);
    });

    it("rejects an array item of the wrong type", () => {
        expect(accepts(REVIEW_SCHEMA, { verdict: "approve", issues: [42] })).toBe(false);
    });

    it("rejects a value of the wrong primitive type", () => {
        expect(accepts({ type: "boolean" }, "true")).toBe(false);
        expect(accepts({ type: "number" }, "1")).toBe(false);
        expect(accepts({ type: "string" }, 1)).toBe(false);
    });

    it("keeps properties the schema does not mention", () => {
        const parsed = jsonSchemaToZod(REVIEW_SCHEMA).parse({
            verdict: "approve",
            issues: [],
            extra: "mantido",
        });

        expect(parsed).toMatchObject({ extra: "mantido" });
    });

    it("accepts anything for a type it does not know", () => {
        expect(accepts({ type: "null" }, { qualquer: "coisa" })).toBe(true);
        expect(accepts({}, 42)).toBe(true);
    });
});
