import { DATA_LABEL_SEPARATOR } from "@/engine/available_data_fields.js";
import type { DataField, DataType } from "@/engine/available_data.js";

export interface DataFieldGroup<Field extends DataField> {
    title: string;
    fields: Field[];
}

const DATA_TYPE_NAMES: Record<DataType, string> = {
    boolean: "sim/não",
    number: "número",
    string: "texto",
    list: "lista",
    object: "objeto",
    any: "qualquer",
};
const ENUM_VALUE_SEPARATOR = " | ";
const SAMPLE_MAX_LENGTH = 40;
const TRUNCATION_MARK = "…";

export function filterFieldsBySearch<Field extends DataField>(
    fields: Field[],
    search: string,
): Field[] {
    const normalizedSearch = search.trim().toLowerCase();

    return fields.filter(
        (field) =>
            field.label.toLowerCase().includes(normalizedSearch) ||
            field.path.toLowerCase().includes(normalizedSearch),
    );
}

// The first segment of a label names where the field comes from ("Reviewer", "Item atual"…).
export function groupFieldsBySource<Field extends DataField>(
    fields: Field[],
): DataFieldGroup<Field>[] {
    const groups = new Map<string, Field[]>();
    for (const field of fields) {
        const title = sourceTitleOf(field);
        groups.set(title, [...(groups.get(title) ?? []), field]);
    }

    return [...groups].map(([title, groupFields]) => ({ title, fields: groupFields }));
}

export function labelWithinSource(field: DataField): string {
    return field.label.split(DATA_LABEL_SEPARATOR).slice(1).join(DATA_LABEL_SEPARATOR);
}

export function describeFieldType(field: DataField): string {
    if (field.enumValues) {
        return `opções: ${field.enumValues.join(ENUM_VALUE_SEPARATOR)}`;
    }

    return DATA_TYPE_NAMES[field.type];
}

export function truncateSample(sampleText: string): string {
    if (sampleText.length <= SAMPLE_MAX_LENGTH) {
        return sampleText;
    }

    return `${sampleText.slice(0, SAMPLE_MAX_LENGTH)}${TRUNCATION_MARK}`;
}

function sourceTitleOf(field: DataField): string {
    const [title = field.label] = field.label.split(DATA_LABEL_SEPARATOR);

    return title;
}
