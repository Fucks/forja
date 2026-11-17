import { z } from "zod";

import type { JsonSchema } from "@/shared/json_schema.js";
import { assertNever } from "@/lib/assert_never.js";

export type ResponseFieldType = "boolean" | "number" | "string" | "list" | "choice";
export type ListItemType = "string" | "number";

export interface ResponseField {
    name: string;
    type: ResponseFieldType;
    description?: string;
    required: boolean;
    choices?: string[];
    itemType?: ListItemType;
}

export const RESPONSE_FIELD_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const DEFAULT_LIST_ITEM_TYPE: ListItemType = "string";

type FieldShape = Omit<ResponseField, "name" | "required" | "description">;

const descriptionSchema = z.string().optional();

const visualPropertySchema = z.union([
    z
        .strictObject({
            type: z.enum(["boolean", "number", "string"]),
            description: descriptionSchema,
        })
        .transform(({ type, description }) => withDescription<FieldShape>({ type }, description)),
    z
        .strictObject({
            type: z.literal("string"),
            enum: z.array(z.string()),
            description: descriptionSchema,
        })
        .transform(({ enum: choices, description }) =>
            withDescription<FieldShape>({ type: "choice", choices }, description),
        ),
    z
        .strictObject({
            type: z.literal("array"),
            items: z.strictObject({ type: z.enum(["string", "number"]) }),
            description: descriptionSchema,
        })
        .transform(({ items, description }) =>
            withDescription<FieldShape>({ type: "list", itemType: items.type }, description),
        ),
]);

const visualObjectSchema = z.strictObject({
    type: z.literal("object"),
    properties: z.record(z.string().regex(RESPONSE_FIELD_NAME_PATTERN), visualPropertySchema),
    required: z.array(z.string()).optional(),
});

export function toJsonSchema(fields: ResponseField[]): JsonSchema {
    const properties = Object.fromEntries(
        fields.map((field) => [field.name, toPropertySchema(field)]),
    );
    const required = fields.filter((field) => field.required).map((field) => field.name);

    return { type: "object", properties, required };
}

/** The fields of the schema, or undefined when the schema is too advanced for the visual editor. */
export function fromJsonSchema(schema: JsonSchema): ResponseField[] | undefined {
    const parsed = visualObjectSchema.safeParse(schema);
    if (!parsed.success) {
        return undefined;
    }

    const { properties, required = [] } = parsed.data;
    const declaresEveryRequiredField = required.every((name) => Object.hasOwn(properties, name));
    if (!declaresEveryRequiredField) {
        return undefined;
    }

    return Object.entries(properties).map(([name, shape]) => ({
        name,
        required: required.includes(name),
        ...shape,
    }));
}

function toPropertySchema(field: ResponseField): JsonSchema {
    return withDescription(toTypeSchema(field), field.description);
}

function toTypeSchema(field: ResponseField): JsonSchema {
    switch (field.type) {
        case "boolean":
        case "number":
        case "string":
            return { type: field.type };
        case "list":
            return { type: "array", items: { type: field.itemType ?? DEFAULT_LIST_ITEM_TYPE } };
        case "choice":
            return { type: "string", enum: field.choices ?? [] };
        default:
            return assertNever(field.type);
    }
}

function withDescription<T extends object>(
    shape: T,
    description: string | undefined,
): T & { description?: string } {
    if (description === undefined) {
        return shape;
    }

    return { ...shape, description };
}
