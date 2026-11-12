import { z } from "zod";

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
}

export const EMPTY_TOKEN_USAGE: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
};

export function addTokenUsage(total: TokenUsage, usage: TokenUsage): TokenUsage {
    return {
        inputTokens: total.inputTokens + usage.inputTokens,
        outputTokens: total.outputTokens + usage.outputTokens,
        cacheReadInputTokens: total.cacheReadInputTokens + usage.cacheReadInputTokens,
        cacheCreationInputTokens: total.cacheCreationInputTokens + usage.cacheCreationInputTokens,
    };
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
    nodeId?: string;
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

export const usageQueryParams = z
    .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        groupBy: z.enum(USAGE_GROUP_BYS),
        flowId: z.string().min(1).optional(),
        nodeId: z.string().min(1).optional(),
    })
    .refine(({ from, to }) => from < to, {
        message: "O início do período precisa ser antes do fim.",
        path: ["from"],
    });
