import type { NewUsageRecord } from "@/server/usage/usage_service.js";
import type { TokenUsage } from "@/shared/usage_types.js";

export function buildTokenUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
    return {
        inputTokens: 1_000,
        outputTokens: 200,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        ...overrides,
    };
}

export function buildNewUsageRecord(overrides: Partial<NewUsageRecord> = {}): NewUsageRecord {
    return {
        projectId: "prj_forja",
        runId: "run_entrega",
        flowId: "flw_entrega",
        nodeId: "dev",
        nodeRunId: "nrn_dev",
        workItemId: "itm_issue1",
        iteration: 0,
        model: "claude-opus-5-5",
        usage: buildTokenUsage(),
        ...overrides,
    };
}
