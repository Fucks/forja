import { z } from "zod";

import { EFFORTS } from "@/shared/agent_types.js";

const SYSTEM_PROMPT_MAX_LENGTH = 20_000;
const PROJECT_MAX_CONCURRENT_AGENTS = 16;
const GLOBAL_MAX_CONCURRENT_AGENTS = 32;
const MAX_START_INTERVAL_MS = 60_000;
const MAX_USAGE_LIMIT_MARGIN_MINUTES = 120;
const MAX_LOG_RETENTION_DAYS = 365;
const MIN_LOG_TOTAL_MB = 100;
const MAX_LOG_TOTAL_MB = 100_000;

export const projectSettingsSchema = z.object({
    defaultCredentialId: z.string().nullable().default(null),
    githubCredentialId: z.string().nullable().default(null),
    defaultModel: z.string().default("claude-opus-5-5"),
    defaultEffort: z.enum(EFFORTS).default("high"),
    defaultToolProfileId: z.string().default("tlp_builtin_default"),
    // Appended to the prompt of every agent node of the project.
    systemPrompt: z.string().max(SYSTEM_PROMPT_MAX_LENGTH).default(""),
    agentImage: z.string().default("forja-agent:latest"),
    maxConcurrentAgents: z.number().int().min(1).max(PROJECT_MAX_CONCURRENT_AGENTS).default(3),
    dailyBudgetUsd: z.number().positive().nullable().default(null),
    timezone: z.string().default("America/Sao_Paulo"),
});

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

const modelPriceSchema = z.object({
    inputPerMTok: z.number(),
    outputPerMTok: z.number(),
    cacheReadPerMTok: z.number(),
    cacheWritePerMTok: z.number(),
});

export const globalSettingsSchema = z.object({
    maxConcurrentAgents: z.number().int().min(1).max(GLOBAL_MAX_CONCURRENT_AGENTS).default(3),
    minStartIntervalMs: z.number().int().min(0).max(MAX_START_INTERVAL_MS).default(5_000),
    usageLimitMarginMinutes: z
        .number()
        .int()
        .min(0)
        .max(MAX_USAGE_LIMIT_MARGIN_MINUTES)
        .default(5),
    logRetentionDays: z.number().int().min(1).max(MAX_LOG_RETENTION_DAYS).default(30),
    logMaxTotalMb: z.number().int().min(MIN_LOG_TOTAL_MB).max(MAX_LOG_TOTAL_MB).default(2_048),
    modelPrices: z.record(z.string(), modelPriceSchema).default({}),
});

export type GlobalSettings = z.infer<typeof globalSettingsSchema>;

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = projectSettingsSchema.parse({});
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = globalSettingsSchema.parse({});
