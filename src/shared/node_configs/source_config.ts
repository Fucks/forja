import { z } from "zod";

export const SOURCE_PROVIDERS = ["github", "local"] as const;

export const MIN_SOURCE_LIMIT = 1;
export const MAX_SOURCE_LIMIT = 100;
const DEFAULT_SOURCE_LIMIT = 20;

export const sourceConfigSchema = z.object({
    provider: z.enum(SOURCE_PROVIDERS),
    label: z.string().optional(),
    state: z.literal("open").default("open"),
    limit: z.int().min(MIN_SOURCE_LIMIT).max(MAX_SOURCE_LIMIT).default(DEFAULT_SOURCE_LIMIT),
    skipBlocked: z.boolean().default(true),
});
export type SourceConfig = z.infer<typeof sourceConfigSchema>;
