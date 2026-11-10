import { z } from "zod";

export const MIN_SCRIPT_TIMEOUT_MINUTES = 1;
const DEFAULT_SCRIPT_TIMEOUT_MINUTES = 15;

export const scriptConfigSchema = z.object({
    command: z.string(),
    timeoutMinutes: z.int().min(MIN_SCRIPT_TIMEOUT_MINUTES).default(DEFAULT_SCRIPT_TIMEOUT_MINUTES),
    workspace: z.literal("item").default("item"),
});
export type ScriptConfig = z.infer<typeof scriptConfigSchema>;
