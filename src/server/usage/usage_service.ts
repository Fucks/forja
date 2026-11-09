import type { UsageTotals } from "@/engine/budgets.js";
import type { Clock } from "@/lib/clock.js";
import type { IdPrefix } from "@/lib/ids.js";
import { localDayOf } from "@/lib/local_day.js";
import { resolveWith } from "@/lib/resolve_with.js";
import { estimateCostUsd, priceFor } from "@/server/usage/model_prices.js";
import {
    type GroupTotals,
    NO_ITEM_KEY,
    type UsageRepository,
} from "@/server/usage/usage_repository.js";
import type {
    ModelPrice,
    UsageAggregate,
    UsageGroupBy,
    UsageQuery,
    UsageRecord,
} from "@/shared/usage_types.js";

type LabelLookup = (repo: UsageRepository, keys: string[]) => Map<string, string>;

const NO_ITEM_LABEL = "Sem item";

// The other groups are labeled by their own key.
const LABEL_LOOKUPS: Partial<Record<UsageGroupBy, LabelLookup>> = {
    flow: (repo, flowIds) => repo.findFlowNames(flowIds),
    item: (repo, workItemIds) => repo.findWorkItemTitles(workItemIds),
};

export type NewUsageRecord = Omit<UsageRecord, "id" | "costUsd" | "priceEstimated" | "at">;

export interface UsageService {
    // The cost uses the prices of the moment; changing the prices later keeps it.
    record(input: NewUsageRecord): Promise<UsageRecord>;
    aggregate(query: UsageQuery): Promise<UsageAggregate[]>;
    todaySpent(projectId: string, timezone: string): Promise<UsageTotals>;
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
        aggregate: (query) => aggregateUsage(deps, query),
        todaySpent: (projectId, timezone) =>
            resolveWith(() => spentToday(deps, projectId, timezone)),
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

async function aggregateUsage(
    deps: UsageServiceDeps,
    query: UsageQuery,
): Promise<UsageAggregate[]> {
    const timezone = await deps.timezoneOf(query.projectId);
    const groups = deps.repo.totalsByGroup(query, timezone);
    const labels = findLabels(deps.repo, query.groupBy, groups);

    return groups.map((totals) => ({
        ...totals,
        label: labels.get(totals.key) ?? fallbackLabelOf(totals.key),
    }));
}

function findLabels(
    repo: UsageRepository,
    groupBy: UsageGroupBy,
    groups: GroupTotals[],
): Map<string, string> {
    const lookUpLabels = LABEL_LOOKUPS[groupBy];
    if (!lookUpLabels) {
        return new Map();
    }

    const keys = groups.map(({ key }) => key);
    return lookUpLabels(repo, keys);
}

function fallbackLabelOf(key: string): string {
    return key === NO_ITEM_KEY ? NO_ITEM_LABEL : key;
}

function spentToday(deps: UsageServiceDeps, projectId: string, timezone: string): UsageTotals {
    const today = localDayOf(deps.clock.now(), timezone);

    return deps.repo.spentOnDay(projectId, timezone, today);
}
