import { minimalValueForSchema } from "@/integrations/agent_runtime/minimal_schema_value.js";
import { jsonSchemaToZod } from "@/integrations/agent_runtime/output_schema.js";

describe("minimalValueForSchema", () => {
    it.each([
        [{ type: "boolean" }, true],
        [{ type: "string" }, "ok"],
        [{ type: "number" }, 0],
        [{ type: "integer" }, 0],
        [{ type: "array", items: { type: "string" } }, []],
        [{ enum: ["approved", "rejected"] }, "approved"],
    ])("generates the minimal value for %j", (schema, expected) => {
        expect(minimalValueForSchema(schema)).toEqual(expected);
    });

    it("fills only the required properties of an object", () => {
        const schema = {
            type: "object",
            properties: { approved: { type: "boolean" }, notes: { type: "string" } },
            required: ["approved"],
        };

        expect(minimalValueForSchema(schema)).toEqual({ approved: true });
    });

    it("fills the required properties of nested objects", () => {
        const schema = {
            type: "object",
            properties: {
                review: {
                    type: "object",
                    properties: { score: { type: "integer" } },
                    required: ["score"],
                },
            },
            required: ["review"],
        };

        expect(minimalValueForSchema(schema)).toEqual({ review: { score: 0 } });
    });

    it("generates a value that passes the validation of the agent output", () => {
        const schema = {
            type: "object",
            properties: {
                approved: { type: "boolean" },
                notes: { type: "string" },
                files: { type: "array", items: { type: "string" } },
                verdict: { enum: ["ship", "hold"] },
            },
            required: ["approved", "notes", "files", "verdict"],
        };

        const value = minimalValueForSchema(schema);

        expect(jsonSchemaToZod(schema).safeParse(value).success).toBe(true);
    });

    it("generates null for a schema without a known type", () => {
        expect(minimalValueForSchema({})).toBeNull();
    });
});
