import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { addTokenUsage, EMPTY_TOKEN_USAGE } from "@/shared/usage_types.js";
import type { TokenUsage, UsageRecord } from "@/shared/usage_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";

const RUN_USAGE_QUERY_KEY = "run-usage";

export interface NodeRunUsage {
    models: string[];
    usage: TokenUsage;
    costUsd: number;
    priceEstimated: boolean;
}

export type UsageByNodeRun = ReadonlyMap<string, NodeRunUsage>;

const NO_NODE_RUN_USAGE: NodeRunUsage = {
    models: [],
    usage: EMPTY_TOKEN_USAGE,
    costUsd: 0,
    priceEstimated: false,
};

// A NodeRun records its usage as it finishes, so each NodeRun that finishes reloads the usage.
export function useNodeRunUsage(runId: string, finishedNodeRunCount: number): UsageByNodeRun {
    const query = useQuery<UsageRecord[], ApiError>({
        queryKey: [RUN_USAGE_QUERY_KEY, runId, finishedNodeRunCount],
        queryFn: () => apiClient.get<UsageRecord[]>(`/runs/${encodeURIComponent(runId)}/usage`),
        placeholderData: keepPreviousData,
    });

    return sumUsageByNodeRun(query.data ?? []);
}

function sumUsageByNodeRun(usageRecords: UsageRecord[]): UsageByNodeRun {
    const usageByNodeRun = new Map<string, NodeRunUsage>();
    for (const record of usageRecords) {
        const usageSoFar = usageByNodeRun.get(record.nodeRunId) ?? NO_NODE_RUN_USAGE;
        usageByNodeRun.set(record.nodeRunId, addRecord(usageSoFar, record));
    }

    return usageByNodeRun;
}

function addRecord(total: NodeRunUsage, record: UsageRecord): NodeRunUsage {
    return {
        models: addModel(total.models, record.model),
        usage: addTokenUsage(total.usage, record.usage),
        costUsd: total.costUsd + record.costUsd,
        priceEstimated: total.priceEstimated || record.priceEstimated,
    };
}

function addModel(models: string[], model: string): string[] {
    return models.includes(model) ? models : [...models, model];
}
