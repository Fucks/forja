import { z } from "zod";

import { StructuredOutputError } from "@/integrations/agent_runtime/agent_errors.js";
import type { ClaudeResult } from "@/integrations/agent_runtime/claude_result.js";

type JsonSchemaNode = z.infer<typeof jsonSchemaNodeSchema>;
type Primitive = string | number | boolean | null;

const nestedSchema = z.record(z.string(), z.unknown());

// Only the keywords the conversion understands; anything else in the schema is ignored.
const jsonSchemaNodeSchema = z.object({
    type: z.string().optional().catch(undefined),
    enum: z.array(z.unknown()).optional().catch(undefined),
    properties: z.record(z.string(), nestedSchema).default({}).catch({}),
    required: z.array(z.string()).default([]).catch([]),
    items: nestedSchema.optional().catch(undefined),
});

const TYPE_CONVERSIONS: Record<string, (node: JsonSchemaNode) => z.ZodType> = {
    object: objectSchemaFrom,
    array: arraySchemaFrom,
    string: () => z.string(),
    number: () => z.number(),
    integer: () => z.int(),
    boolean: () => z.boolean(),
};

/** Supports object, properties, required, string, number, integer, boolean, array and enum. */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
    const node = jsonSchemaNodeSchema.parse(schema);
    if (node.enum) {
        return enumSchemaFrom(node.enum);
    }

    const convert = node.type === undefined ? undefined : TYPE_CONVERSIONS[node.type];
    if (!convert) {
        return z.unknown();
    }

    return convert(node);
}

/**
 * The CLI already validates against `--json-schema`; validating again guards against a CLI that
 * changes or drops that check.
 */
export function readStructuredOutput(
    schema: Record<string, unknown>,
    result: ClaudeResult | undefined,
): unknown {
    const structuredOutput = result?.structuredOutput;
    const parsed = jsonSchemaToZod(schema).safeParse(structuredOutput);
    if (structuredOutput === undefined || !parsed.success) {
        throw new StructuredOutputError(rawOutputOf(result));
    }

    return parsed.data;
}

function objectSchemaFrom(node: JsonSchemaNode): z.ZodType {
    const required = new Set(node.required);
    const shape = Object.fromEntries(
        Object.entries(node.properties).map(([name, propertySchema]) => {
            const propertyType = jsonSchemaToZod(propertySchema);
            return [name, required.has(name) ? propertyType : propertyType.optional()];
        }),
    );

    return z.looseObject(shape);
}

function arraySchemaFrom(node: JsonSchemaNode): z.ZodType {
    const itemType = node.items ? jsonSchemaToZod(node.items) : z.unknown();
    return z.array(itemType);
}

function enumSchemaFrom(values: unknown[]): z.ZodType {
    return z.literal(values.filter(isPrimitive));
}

function isPrimitive(value: unknown): value is Primitive {
    return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function rawOutputOf(result: ClaudeResult | undefined): string | undefined {
    if (result?.structuredOutput === undefined) {
        return result?.text;
    }

    return JSON.stringify(result.structuredOutput);
}
