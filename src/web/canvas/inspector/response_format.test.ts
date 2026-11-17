import type { JsonSchema } from "@/shared/json_schema.js";
import { fromJsonSchema, toJsonSchema } from "@/web/canvas/inspector/response_format.js";
import type { ResponseField } from "@/web/canvas/inspector/response_format.js";

describe("toJsonSchema", () => {
    it("turns a required yes/no and an optional text into an object schema", () => {
        const fields: ResponseField[] = [
            { name: "approved", type: "boolean", required: true },
            { name: "notes", type: "string", required: false },
        ];

        expect(toJsonSchema(fields)).toEqual({
            type: "object",
            properties: { approved: { type: "boolean" }, notes: { type: "string" } },
            required: ["approved"],
        });
    });

    it("turns a choice into a string with enum", () => {
        const fields: ResponseField[] = [
            { name: "kind", type: "choice", required: true, choices: ["bug", "feature"] },
        ];

        expect(toJsonSchema(fields).properties).toEqual({
            kind: { type: "string", enum: ["bug", "feature"] },
        });
    });

    it("turns a list without item type into a list of texts", () => {
        const fields: ResponseField[] = [{ name: "files", type: "list", required: false }];

        expect(toJsonSchema(fields).properties).toEqual({
            files: { type: "array", items: { type: "string" } },
        });
    });

    it("keeps the description of a field", () => {
        const fields: ResponseField[] = [
            { name: "score", type: "number", required: false, description: "De 0 a 10." },
        ];

        expect(toJsonSchema(fields).properties).toEqual({
            score: { type: "number", description: "De 0 a 10." },
        });
    });
});

describe("fromJsonSchema", () => {
    it.each<ResponseField>([
        { name: "approved", type: "boolean", required: true },
        { name: "score", type: "number", required: false, description: "De 0 a 10." },
        { name: "notes", type: "string", required: true },
        { name: "files", type: "list", required: false, itemType: "string" },
        { name: "lines", type: "list", required: true, itemType: "number" },
        { name: "kind", type: "choice", required: true, choices: ["bug", "feature"] },
    ])("reads back a $type field", (field) => {
        expect(fromJsonSchema(toJsonSchema([field]))).toEqual([field]);
    });

    it("reads a schema without required as all fields optional", () => {
        const schema = { type: "object", properties: { ready: { type: "boolean" } } };

        expect(fromJsonSchema(schema)).toEqual([
            { name: "ready", type: "boolean", required: false },
        ]);
    });

    it.each<[string, JsonSchema]>([
        [
            "a nested object",
            {
                type: "object",
                properties: { review: { type: "object", properties: {} } },
            },
        ],
        ["a oneOf", { type: "object", properties: { answer: { oneOf: [{ type: "string" }] } } }],
        ["an integer", { type: "object", properties: { count: { type: "integer" } } }],
        [
            "a list of objects",
            { type: "object", properties: { items: { type: "array", items: { type: "object" } } } },
        ],
        ["a root that is not an object", { type: "array", items: { type: "string" } }],
        [
            "a field name the editor does not accept",
            { type: "object", properties: { "first-name": { type: "string" } } },
        ],
        [
            "a required field that is not declared",
            { type: "object", properties: {}, required: ["approved"] },
        ],
        ["an extra keyword", { type: "object", properties: {}, additionalProperties: false }],
    ])("does not fit the visual editor with %s", (_description, schema) => {
        expect(fromJsonSchema(schema)).toBeUndefined();
    });
});
