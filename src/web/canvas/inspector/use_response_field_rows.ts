import { useState } from "react";

import type { JsonSchema } from "@/shared/json_schema.js";
import {
    EMPTY_RESPONSE_FIELD_ROW,
    listRowErrors,
    toResponseFieldRows,
    toResponseFields,
} from "@/web/canvas/inspector/response_field_rows.js";
import type { ResponseFieldRow, RowError } from "@/web/canvas/inspector/response_field_rows.js";
import { fromJsonSchema, toJsonSchema } from "@/web/canvas/inspector/response_format.js";

export interface ResponseFieldRowsEditing {
    /** Undefined while the schema is too advanced for the visual editor. */
    rows: ResponseFieldRow[] | undefined;
    rowErrors: RowError[];
    editRow: (index: number, changes: Partial<ResponseFieldRow>) => void;
    applyRowChanges: (index: number, changes: Partial<ResponseFieldRow>) => void;
    applyEditedRows: () => void;
    addRow: () => void;
    removeRow: (index: number) => void;
    fillWithRows: (rows: ResponseFieldRow[]) => void;
    restartWithFields: () => void;
}

// Edits stay local until every row is valid; only then the node receives the new schema.
export function useResponseFieldRows(
    outputSchema: JsonSchema | undefined,
    onChange: (outputSchema: JsonSchema | undefined) => void,
): ResponseFieldRowsEditing {
    const [rows, setRows] = useState(() => readRows(outputSchema));
    const [rowErrors, setRowErrors] = useState<RowError[]>([]);

    function applyRows(nextRows: ResponseFieldRow[]): void {
        setRows(nextRows);
        const nextErrors = listRowErrors(nextRows);
        setRowErrors(nextErrors);
        if (nextErrors.some((error) => error !== undefined)) {
            return;
        }

        const nextSchema = toOutputSchema(nextRows);
        if (!describesSameSchema(nextSchema, outputSchema)) {
            onChange(nextSchema);
        }
    }

    const currentRows = rows ?? [];

    return {
        rows,
        rowErrors,
        editRow: (index, changes) => setRows(withRowChanges(currentRows, index, changes)),
        applyRowChanges: (index, changes) => applyRows(withRowChanges(currentRows, index, changes)),
        applyEditedRows: () => applyRows(currentRows),
        addRow: () => setRows([...currentRows, EMPTY_RESPONSE_FIELD_ROW]),
        removeRow: (index) => applyRows(currentRows.filter((_row, rowIndex) => rowIndex !== index)),
        fillWithRows: applyRows,
        restartWithFields: () => setRows([]),
    };
}

function readRows(outputSchema: JsonSchema | undefined): ResponseFieldRow[] | undefined {
    if (!outputSchema) {
        return [];
    }

    const fields = fromJsonSchema(outputSchema);
    if (!fields) {
        return undefined;
    }

    return toResponseFieldRows(fields);
}

// Without fields the agent answers freely, which is an absent schema rather than an empty one.
function toOutputSchema(rows: ResponseFieldRow[]): JsonSchema | undefined {
    if (rows.length === 0) {
        return undefined;
    }

    return toJsonSchema(toResponseFields(rows));
}

function withRowChanges(
    rows: ResponseFieldRow[],
    index: number,
    changes: Partial<ResponseFieldRow>,
): ResponseFieldRow[] {
    return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...changes } : row));
}

function describesSameSchema(
    first: JsonSchema | undefined,
    second: JsonSchema | undefined,
): boolean {
    return JSON.stringify(first) === JSON.stringify(second);
}
