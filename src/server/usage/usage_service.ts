import type { Clock } from "@/lib/clock.js";
import type { IdPrefix } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import { estimateCostUsd, priceFor } from "@/server/usage/model_prices.js";
import type { UsageRepository } from "@/server/usage/usage_repository.js";
import type {
    ModelPrice,
    UsageAggregate,
    UsageQuery,
    UsageRecord,
    UsageSpent,
} from "@/shared/usage_types.js";

export type NewUsageRecord = Omit<UsageRecord, "id" | "costUsd" | "priceEstimated" | "at">;

export interface UsageService {
    // The cost uses the prices of the moment; changing the prices later keeps it.
    record(input: NewUsageRecord): Promise<UsageRecord>;
    aggregate(query: UsageQuery): Promise<UsageAggregate[]>;
    todaySpent(projectId: string, timezone: string): Promise<UsageSpent>;
    forRun(runId: string): Promise<UsageRecord[]>;
}

export interface UsageServiceDeps {
    repo: UsageRepository;
    clock: Clock;
    newId(prefix: IdPrefix): string;
    // The prices configured in the global settings, by model id or family.
    modelPrices(): Promise<Record<string, ModelPrice>>;
    timezoneOf(projectId: string): Promise<string>;
}

export function createUsageService(deps: UsageServiceDeps): UsageService {
    return {
        record: (input) => recordUsage(deps, input),
        aggregate: () => Promise.resolve([]),
        todaySpent: () => Promise.resolve({ costUsd: 0, tokens: 0 }),
        forRun: (runId) => resolveWith(() => deps.repo.listByRun(runId)),
    };
}

async function recordUsage(deps: UsageServiceDeps, input: NewUsageRecord): Promise<UsageRecord> {
    const price = priceFor(input.model, await deps.modelPrices());
    const record: UsageRecord = {
        ...input,
        id: deps.newId("usg"),
        costUsd: estimateCostUsd(input.usage, price),
        priceEstimated: price.estimated,
        at: deps.clock.now().toISOString(),
    };
    deps.repo.insert(record);

    return record;
}
