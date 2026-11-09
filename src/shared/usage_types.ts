import { z } from "zod";

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
}

export const modelPriceSchema = z.object({
    inputPerMTok: z.number(),
    outputPerMTok: z.number(),
    cacheReadPerMTok: z.number(),
    cacheWritePerMTok: z.number(),
});

// USD per million tokens.
export type ModelPrice = z.infer<typeof modelPriceSchema>;

export interface UsageRecord {
    id: string;
    projectId: string;
    runId: string;
    flowId: string;
    nodeId: string;
    nodeRunId: string;
    workItemId?: string;
    iteration: number;
    model: string;
    usage: TokenUsage;
    costUsd: number;
    // The model had no known price, so the cost used the opus price.
    priceEstimated: boolean;
    at: string;
}

export const USAGE_GROUP_BYS = ["day", "flow", "node", "model", "item", "run"] as const;

export type UsageGroupBy = (typeof USAGE_GROUP_BYS)[number];

export interface UsageQuery {
    projectId: string;
    from: Date;
    to: Date;
    groupBy: UsageGroupBy;
    flowId?: string;
}

export interface UsageAggregate {
    key: string;
    label: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    nodeRuns: number;
}
