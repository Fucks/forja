import { asc, eq } from "drizzle-orm";

import type { ForjaDb } from "@/server/db/client.js";
import { usageRecords, type UsageRecordRow } from "@/server/db/schema/usage.js";
import type { UsageRecord } from "@/shared/usage_types.js";

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
