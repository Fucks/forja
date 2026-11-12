import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { UsageRecord } from "@/shared/usage_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";

const RUN_USAGE_QUERY_KEY = "run-usage";

export type CostUsdByNodeRun = ReadonlyMap<string, number>;

// A NodeRun records its usage as it finishes, so each NodeRun that finishes reloads the costs.
export function useNodeRunCosts(runId: string, finishedNodeRunCount: number): CostUsdByNodeRun {
    const query = useQuery<UsageRecord[], ApiError>({
        queryKey: [RUN_USAGE_QUERY_KEY, runId, finishedNodeRunCount],
        queryFn: () => apiClient.get<UsageRecord[]>(`/runs/${encodeURIComponent(runId)}/usage`),
        placeholderData: keepPreviousData,
    });

    return sumCostByNodeRun(query.data ?? []);
}

function sumCostByNodeRun(usageRecords: UsageRecord[]): CostUsdByNodeRun {
    const costUsdByNodeRun = new Map<string, number>();
    for (const { nodeRunId, costUsd } of usageRecords) {
        costUsdByNodeRun.set(nodeRunId, (costUsdByNodeRun.get(nodeRunId) ?? 0) + costUsd);
    }

    return costUsdByNodeRun;
}
