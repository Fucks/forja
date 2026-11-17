import type { DataField, DataType } from "@/engine/available_data.js";
import { CONDITION_PATH_SEPARATOR } from "@/shared/conditions.js";
import { jsonSchemaSchema } from "@/shared/json_schema.js";
import type { JsonSchema } from "@/shared/json_schema.js";

/** Where a shape is read from: its path, its label and the node that produces it. */
export interface FieldPlace {
    path: string;
    label: string;
    sourceNodeId?: string;
}

export const DATA_LABEL_SEPARATOR = " › ";

const MAX_PROPERTY_DEPTH = 4;
const DATA_TYPES_BY_SCHEMA_TYPE = new Map<unknown, DataType>([
    ["boolean", "boolean"],
    ["number", "number"],
    ["integer", "number"],
    ["string", "string"],
    ["array", "list"],
    ["object", "object"],
]);

/** The field at the place itself, followed by the fields of its properties. */
export function describeShapeFields(place: FieldPlace, shape: JsonSchema, depth = 0): DataField[] {
    return [toDataField(place, shape, depth), ...describePropertyFields(place, shape, depth + 1)];
}

/** Only the fields of the shape's properties, starting at the given depth. */
export function describePropertyFields(
    parent: FieldPlace,
    shape: JsonSchema,
    depth: number,
): DataField[] {
    if (depth > MAX_PROPERTY_DEPTH) {
        return [];
    }

    return listProperties(shape).flatMap(([name, propertyShape]) =>
        describeShapeFields(placeOfProperty(parent, name), propertyShape, depth),
    );
}

function toDataField(place: FieldPlace, shape: JsonSchema, depth: number): DataField {
    const field: DataField = { path: place.path, label: place.label, type: toDataType(shape), depth };
    const enumValues = readEnumValues(shape);
    if (enumValues) {
        field.enumValues = enumValues;
    }
    if (typeof shape.description === "string") {
        field.description = shape.description;
    }
    if (place.sourceNodeId !== undefined) {
        field.sourceNodeId = place.sourceNodeId;
    }

    return field;
}

function toDataType(shape: JsonSchema): DataType {
    return DATA_TYPES_BY_SCHEMA_TYPE.get(shape.type) ?? "any";
}

function readEnumValues(shape: JsonSchema): (string | number)[] | undefined {
    if (!Array.isArray(shape.enum)) {
        return undefined;
    }

    return shape.enum.filter(
        (value): value is string | number => typeof value === "string" || typeof value === "number",
    );
}

function listProperties(shape: JsonSchema): [string, JsonSchema][] {
    const properties = jsonSchemaSchema.safeParse(shape.properties);
    if (!properties.success) {
        return [];
    }

    return Object.entries(properties.data).flatMap(([name, propertyShape]) => {
        const parsedShape = jsonSchemaSchema.safeParse(propertyShape);
        return parsedShape.success ? [[name, parsedShape.data]] : [];
    });
}

function placeOfProperty(parent: FieldPlace, name: string): FieldPlace {
    return {
        ...parent,
        path: [parent.path, name].join(CONDITION_PATH_SEPARATOR),
        label: [parent.label, name].join(DATA_LABEL_SEPARATOR),
    };
}
