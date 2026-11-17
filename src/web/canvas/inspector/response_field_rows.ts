import {
    RESPONSE_FIELD_NAME_PATTERN,
    type ListItemType,
    type ResponseField,
    type ResponseFieldType,
} from "@/web/canvas/inspector/response_format.js";

/** A field as the user edits it: the options stay as typed until the row is applied. */
export interface ResponseFieldRow {
    name: string;
    type: ResponseFieldType;
    description: string;
    required: boolean;
    choicesText: string;
    itemType: ListItemType;
}

export type RowError = string | undefined;

export const EMPTY_RESPONSE_FIELD_ROW: ResponseFieldRow = {
    name: "",
    type: "string",
    description: "",
    required: false,
    choicesText: "",
    itemType: "string",
};

const CHOICES_SEPARATOR = ",";
const CHOICES_JOINER = ", ";
const INVALID_NAME_MESSAGE = "Use letras, números e _, sem começar por número.";
const DUPLICATE_NAME_MESSAGE = "Já existe um campo com esse nome.";
const CHOICE_WITHOUT_OPTIONS_MESSAGE = "Escreva as opções separadas por vírgula.";

export function toResponseFieldRows(fields: ResponseField[]): ResponseFieldRow[] {
    return fields.map((field) => ({
        name: field.name,
        type: field.type,
        description: field.description ?? "",
        required: field.required,
        choicesText: (field.choices ?? []).join(CHOICES_JOINER),
        itemType: field.itemType ?? EMPTY_RESPONSE_FIELD_ROW.itemType,
    }));
}

export function listRowErrors(rows: ResponseFieldRow[]): RowError[] {
    return rows.map((row, index) => {
        const namesAbove = rows.slice(0, index).map((rowAbove) => rowAbove.name);

        return findRowError(row, namesAbove);
    });
}

// Only the keys of the chosen type are kept, so the schema does not carry leftovers of other types.
export function toResponseFields(rows: ResponseFieldRow[]): ResponseField[] {
    return rows.map((row) => {
        const field: ResponseField = { name: row.name, type: row.type, required: row.required };
        const description = row.description.trim();

        return {
            ...field,
            ...(description !== "" && { description }),
            ...(row.type === "choice" && { choices: parseChoices(row.choicesText) }),
            ...(row.type === "list" && { itemType: row.itemType }),
        };
    });
}

function findRowError(row: ResponseFieldRow, namesAbove: string[]): RowError {
    if (!RESPONSE_FIELD_NAME_PATTERN.test(row.name)) {
        return INVALID_NAME_MESSAGE;
    }
    if (namesAbove.includes(row.name)) {
        return DUPLICATE_NAME_MESSAGE;
    }
    if (row.type === "choice" && parseChoices(row.choicesText).length === 0) {
        return CHOICE_WITHOUT_OPTIONS_MESSAGE;
    }

    return undefined;
}

function parseChoices(choicesText: string): string[] {
    return choicesText
        .split(CHOICES_SEPARATOR)
        .map((choice) => choice.trim())
        .filter((choice) => choice !== "");
}
