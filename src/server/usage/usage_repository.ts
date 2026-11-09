import {
    and,
    type AnyColumn,
    asc,
    countDistinct,
    eq,
    gte,
    inArray,
    lt,
    sql,
    type SQL,
} from "drizzle-orm";

import type { ForjaDb } from "@/server/db/client.js";
import { flows } from "@/server/db/schema/flows.js";
import { usageRecords, type UsageRecordRow } from "@/server/db/schema/usage.js";
import { workItems } from "@/server/db/schema/work_items.js";
import { LOCAL_DAY_FUNCTION } from "@/server/db/sql_functions.js";
import type {
    UsageAggregate,
    UsageGroupBy,
    UsageQuery,
    UsageRecord,
} from "@/shared/usage_types.js";

export type UsageTotals = Omit<UsageAggregate, "label">;

export const NO_ITEM_KEY = "";

const GROUP_KEYS: Record<UsageGroupBy, (timeZone: string) => SQL<string>> = {
    day: (timeZone) => localDayOfRecord(timeZone),
    flow: () => sql<string>`${usageRecords.flowId}`,
    node: () => sql<string>`${usageRecords.nodeId}`,
    model: () => sql<string>`${usageRecords.model}`,
    item: () => sql<string>`coalesce(${usageRecords.workItemId}, ${NO_ITEM_KEY})`,
    run: () => sql<string>`${usageRecords.runId}`,
};

export class UsageRepository {
    constructor(private readonly db: ForjaDb) {}

    insert(record: UsageRecord): void {
        this.db.insert(usageRecords).values(toRow(record)).run();
    }

    listByRun(runId: string): UsageRecord[] {
        return this.db
            .select()
            .from(usageRecords)
            .where(eq(usageRecords.runId, runId))
            .orderBy(asc(usageRecords.at), asc(usageRecords.id))
            .all()
            .map(toRecord);
    }

    // The period includes `from` and excludes `to`; days are those of the time zone.
    totalsByGroup(query: UsageQuery, timeZone: string): UsageTotals[] {
        const groupKey = GROUP_KEYS[query.groupBy](timeZone);

        return this.db
            .select({
                key: groupKey,
                inputTokens: sumOf(usageRecords.inputTokens),
                outputTokens: sumOf(usageRecords.outputTokens),
                cacheReadTokens: sumOf(usageRecords.cacheReadTokens),
                costUsd: sumOf(usageRecords.costUsd),
                nodeRuns: countDistinct(usageRecords.nodeRunId),
            })
            .from(usageRecords)
            .where(whereQueryMatches(query))
            .groupBy(groupKey)
            .orderBy(groupKey)
            .all();
    }

    findFlowNames(flowIds: string[]): Map<string, string> {
        const rows = this.db
            .select({ id: flows.id, name: flows.name })
            .from(flows)
            .where(inArray(flows.id, flowIds))
            .all();

        return new Map(rows.map(({ id, name }) => [id, name]));
    }

    findWorkItemTitles(workItemIds: string[]): Map<string, string> {
        const rows = this.db
            .select({ id: workItems.id, title: workItems.title })
            .from(workItems)
            .where(inArray(workItems.id, workItemIds))
            .all();

        return new Map(rows.map(({ id, title }) => [id, title]));
    }
}

function localDayOfRecord(timeZone: string): SQL<string> {
    return sql<string>`${sql.raw(LOCAL_DAY_FUNCTION)}(${usageRecords.at}, ${timeZone})`;
}

function sumOf(column: AnyColumn): SQL<number> {
    return sql<number>`sum(${column})`;
}

function whereQueryMatches(query: UsageQuery): SQL | undefined {
    return and(
        eq(usageRecords.projectId, query.projectId),
        gte(usageRecords.at, query.from.toISOString()),
        lt(usageRecords.at, query.to.toISOString()),
        query.flowId === undefined ? undefined : eq(usageRecords.flowId, query.flowId),
    );
}

function toRow({ usage, workItemId, ...record }: UsageRecord): UsageRecordRow {
    return {
        ...record,
        workItemId: workItemId ?? null,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadInputTokens,
        cacheCreationTokens: usage.cacheCreationInputTokens,
    };
}

function toRecord(row: UsageRecordRow): UsageRecord {
    const {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        workItemId,
        ...record
    } = row;

    return {
        ...record,
        workItemId: workItemId ?? undefined,
        usage: {
            inputTokens,
            outputTokens,
            cacheReadInputTokens: cacheReadTokens,
            cacheCreationInputTokens: cacheCreationTokens,
        },
    };
}
