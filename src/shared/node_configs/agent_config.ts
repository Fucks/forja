import { z } from "zod";

import { EFFORTS } from "@/shared/agent_types.js";
import { jsonSchemaSchema } from "@/shared/json_schema.js";

export const AGENT_WORKSPACES = ["item", "none"] as const;

export const MIN_AGENT_ITERATIONS = 1;
export const MAX_AGENT_ITERATIONS = 200;
const DEFAULT_AGENT_ITERATIONS = 1;
export const MIN_AGENT_TURNS = 1;
export const MAX_AGENT_TURNS = 500;
export const MIN_AGENT_RETRIES = 0;
export const MAX_AGENT_RETRIES = 5;
const DEFAULT_AGENT_RETRIES = 1;
const DEFAULT_AGENT_TIMEOUT_MINUTES = 60;
const DEFAULT_AGENT_IDLE_TIMEOUT_MINUTES = 10;
export const MIN_AGENT_TIMEOUT_MINUTES = 1;

export const agentConfigSchema = z.object({
    prompt: z.string(),
    model: z.string().optional(),
    effort: z.enum(EFFORTS).optional(),
    maxIterations: z
        .int()
        .min(MIN_AGENT_ITERATIONS)
        .max(MAX_AGENT_ITERATIONS)
        .default(DEFAULT_AGENT_ITERATIONS),
    maxTurns: z.int().min(MIN_AGENT_TURNS).max(MAX_AGENT_TURNS).optional(),
    maxBudgetUsd: z.number().positive().optional(),
    expandPromptCommands: z.boolean().default(true),
    toolProfileId: z.string().optional(),
    credentialId: z.string().optional(),
    outputSchema: jsonSchemaSchema.optional(),
    workspace: z.enum(AGENT_WORKSPACES).default("item"),
    timeoutMinutes: z.int().min(MIN_AGENT_TIMEOUT_MINUTES).default(DEFAULT_AGENT_TIMEOUT_MINUTES),
    idleTimeoutMinutes: z
        .int()
        .min(MIN_AGENT_TIMEOUT_MINUTES)
        .default(DEFAULT_AGENT_IDLE_TIMEOUT_MINUTES),
    retries: z.int().min(MIN_AGENT_RETRIES).max(MAX_AGENT_RETRIES).default(DEFAULT_AGENT_RETRIES),
    completionSignal: z.string().optional(),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;
