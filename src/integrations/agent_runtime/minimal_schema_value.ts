import { z } from "zod";

type SchemaNode = z.infer<typeof schemaNodeSchema>;

const nestedSchema = z.record(z.string(), z.unknown());

// The same keywords `jsonSchemaToZod` validates; anything else in the schema is ignored.
const schemaNodeSchema = z.object({
    type: z.string().optional().catch(undefined),
    enum: z.array(z.unknown()).optional().catch(undefined),
    properties: z.record(z.string(), nestedSchema).default({}).catch({}),
    required: z.array(z.string()).default([]).catch([]),
});

const MINIMAL_VALUE_BY_TYPE: Record<string, (node: SchemaNode) => unknown> = {
    object: minimalObjectFor,
    array: () => [],
    string: () => "ok",
    number: () => 0,
    integer: () => 0,
    boolean: () => true,
};

/** The smallest value that satisfies the schema, as `jsonSchemaToZod` validates it. */
export function minimalValueForSchema(schema: Record<string, unknown>): unknown {
    const node = schemaNodeSchema.parse(schema);
    if (node.enum) {
        return node.enum[0] ?? null;
    }

    const generate = node.type === undefined ? undefined : MINIMAL_VALUE_BY_TYPE[node.type];
    if (!generate) {
        return null;
    }

    return generate(node);
}

function minimalObjectFor(node: SchemaNode): Record<string, unknown> {
    const requiredProperties = Object.entries(node.properties).filter(([name]) =>
        node.required.includes(name),
    );

    return Object.fromEntries(
        requiredProperties.map(([name, propertySchema]) => [
            name,
            minimalValueForSchema(propertySchema),
        ]),
    );
}
