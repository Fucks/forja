import { useState } from "react";

import type { ScriptEnvVar } from "@/shared/node_configs/script_config.js";
import {
    EMPTY_ENV_VAR_ROW,
    listEnvVarNameErrors,
    toEnvVarRows,
    toScriptEnvVars,
} from "@/web/canvas/inspector/env_var_rows.js";
import type { EnvVarNameError, EnvVarRow } from "@/web/canvas/inspector/env_var_rows.js";

type MoveDirection = -1 | 1;

export interface EnvVarRowsEditing {
    rows: EnvVarRow[];
    nameErrors: EnvVarNameError[];
    editRow: (index: number, changes: Partial<EnvVarRow>) => void;
    applyRowChanges: (index: number, changes: Partial<EnvVarRow>) => void;
    applyEditedRows: () => void;
    addRow: () => void;
    removeRow: (index: number) => void;
    moveRow: (index: number, direction: MoveDirection) => void;
}

// Edits stay local until every row is valid and complete; only then the node receives the env.
export function useEnvVarRows(
    env: ScriptEnvVar[],
    onChange: (env: ScriptEnvVar[]) => void,
): EnvVarRowsEditing {
    const [rows, setRows] = useState(() => toEnvVarRows(env));

    function applyRows(nextRows: EnvVarRow[]): void {
        setRows(nextRows);
        const nextEnv = toScriptEnvVars(nextRows);
        if (nextEnv && !describesSameEnv(nextEnv, env)) {
            onChange(nextEnv);
        }
    }

    return {
        rows,
        nameErrors: listEnvVarNameErrors(rows),
        editRow: (index, changes) => setRows(withRowChanges(rows, index, changes)),
        applyRowChanges: (index, changes) => applyRows(withRowChanges(rows, index, changes)),
        applyEditedRows: () => applyRows(rows),
        addRow: () => setRows([...rows, EMPTY_ENV_VAR_ROW]),
        removeRow: (index) => applyRows(rows.filter((_row, rowIndex) => rowIndex !== index)),
        moveRow: (index, direction) => applyRows(withRowMoved(rows, index, index + direction)),
    };
}

function withRowChanges(
    rows: EnvVarRow[],
    index: number,
    changes: Partial<EnvVarRow>,
): EnvVarRow[] {
    return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...changes } : row));
}

function withRowMoved(rows: EnvVarRow[], fromIndex: number, toIndex: number): EnvVarRow[] {
    const movedRow = rows[fromIndex];
    if (!movedRow || toIndex < 0 || toIndex >= rows.length) {
        return rows;
    }

    const remainingRows = rows.filter((_row, rowIndex) => rowIndex !== fromIndex);

    return [...remainingRows.slice(0, toIndex), movedRow, ...remainingRows.slice(toIndex)];
}

function describesSameEnv(first: ScriptEnvVar[], second: ScriptEnvVar[]): boolean {
    return JSON.stringify(first) === JSON.stringify(second);
}
