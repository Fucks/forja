import { ENV_VAR_NAME_PATTERN } from "@/shared/node_configs/script_config.js";
import type { ScriptEnvVar } from "@/shared/node_configs/script_config.js";

export type EnvVarSource = "text" | "credential";

/** A variable as the user edits it: both sources are kept, so switching back loses nothing. */
export interface EnvVarRow {
    name: string;
    source: EnvVarSource;
    value: string;
    credentialId: string;
}

export type EnvVarNameError = string | undefined;

export const EMPTY_ENV_VAR_ROW: EnvVarRow = {
    name: "",
    source: "text",
    value: "",
    credentialId: "",
};

const INVALID_NAME_MESSAGE = "Use letras maiúsculas, números e _, sem começar por número.";
const DUPLICATE_NAME_MESSAGE = "Já existe uma variável com esse nome.";

export function toEnvVarRows(env: ScriptEnvVar[]): EnvVarRow[] {
    return env.map((envVar) => {
        if (envVar.credentialId !== undefined) {
            return {
                ...EMPTY_ENV_VAR_ROW,
                name: envVar.name,
                source: "credential",
                credentialId: envVar.credentialId,
            };
        }

        return { ...EMPTY_ENV_VAR_ROW, name: envVar.name, value: envVar.value ?? "" };
    });
}

// A name not typed yet is incomplete rather than wrong, so it shows no error.
export function listEnvVarNameErrors(rows: EnvVarRow[]): EnvVarNameError[] {
    return rows.map((row, index) => {
        if (row.name === "") {
            return undefined;
        }
        if (!ENV_VAR_NAME_PATTERN.test(row.name)) {
            return INVALID_NAME_MESSAGE;
        }

        const namesAbove = rows.slice(0, index).map((rowAbove) => rowAbove.name);

        return namesAbove.includes(row.name) ? DUPLICATE_NAME_MESSAGE : undefined;
    });
}

/** The variables to save, or undefined while some row is wrong or incomplete. */
export function toScriptEnvVars(rows: EnvVarRow[]): ScriptEnvVar[] | undefined {
    const hasNameError = listEnvVarNameErrors(rows).some((error) => error !== undefined);
    if (hasNameError || !rows.every(isComplete)) {
        return undefined;
    }

    return rows.map(toScriptEnvVar);
}

function isComplete(row: EnvVarRow): boolean {
    if (row.name === "") {
        return false;
    }

    return row.source === "text" || row.credentialId !== "";
}

function toScriptEnvVar(row: EnvVarRow): ScriptEnvVar {
    if (row.source === "credential") {
        return { name: row.name, credentialId: row.credentialId };
    }

    return { name: row.name, value: row.value };
}
