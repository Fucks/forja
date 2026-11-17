import { z } from "zod";

export const SCRIPT_RUN_LOCATIONS = ["item", "isolated"] as const;
export const SCRIPT_SHELLS = ["bash", "sh"] as const;
export const SCRIPT_FAILURE_POLICIES = ["fail", "continue"] as const;
export const SCRIPT_OUTPUT_MODES = ["none", "json", "lastLineJson"] as const;

export const MIN_SCRIPT_TIMEOUT_MINUTES = 1;
const DEFAULT_SCRIPT_TIMEOUT_MINUTES = 15;
export const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const ENV_VAR_SOURCE_MESSAGE = "Informe um valor ou uma credencial para a variável, não os dois.";

export const scriptEnvVarSchema = z
    .object({
        name: z.string().regex(ENV_VAR_NAME_PATTERN),
        /** May read the DataContext with {{path}}. */
        value: z.string().optional(),
        credentialId: z.string().optional(),
    })
    .refine((envVar) => (envVar.value === undefined) !== (envVar.credentialId === undefined), {
        message: ENV_VAR_SOURCE_MESSAGE,
    });
export type ScriptEnvVar = z.infer<typeof scriptEnvVarSchema>;

// The old `workspace: "item"` field is dropped on parse, like every unknown key.
export const scriptConfigSchema = z.object({
    command: z.string(),
    shell: z.enum(SCRIPT_SHELLS).default("bash"),
    runIn: z.enum(SCRIPT_RUN_LOCATIONS).default("item"),
    image: z.string().optional(),
    workingDir: z.string().optional(),
    env: z.array(scriptEnvVarSchema).default([]),
    // "continue" keeps the nodes saved before onFailure existed; new nodes start with "fail".
    onFailure: z.enum(SCRIPT_FAILURE_POLICIES).default("continue"),
    parseOutput: z.enum(SCRIPT_OUTPUT_MODES).default("none"),
    timeoutMinutes: z.int().min(MIN_SCRIPT_TIMEOUT_MINUTES).default(DEFAULT_SCRIPT_TIMEOUT_MINUTES),
});
export type ScriptConfig = z.infer<typeof scriptConfigSchema>;
export type ScriptRunLocation = ScriptConfig["runIn"];
export type ScriptOutputMode = ScriptConfig["parseOutput"];
