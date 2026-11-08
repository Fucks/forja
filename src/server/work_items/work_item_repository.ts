import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { ForjaDb } from "@/server/db/client.js";
import { projects } from "@/server/db/schema/projects.js";
import { workItems } from "@/server/db/schema/work_items.js";
import type { WorkItemRow } from "@/server/db/schema/work_items.js";
import { MANUAL_COLUMNS, WORK_ITEM_SOURCES, WORK_ITEM_STATES } from "@/shared/work_item_types.js";
import type { WorkItem } from "@/shared/work_item_types.js";

const stringListSchema = z.array(z.string());
const sourceSchema = z.enum(WORK_ITEM_SOURCES);
const stateSchema = z.enum(WORK_ITEM_STATES);
const manualColumnSchema = z.enum(MANUAL_COLUMNS);

type WorkItemWriter = Pick<ForjaDb, "insert" | "update">;

export interface SyncBatch {
    inserts: WorkItem[];
    updates: WorkItem[];
}

export class WorkItemRepository {
    constructor(private readonly db: ForjaDb) {}

    projectExists(projectId: string): boolean {
        const row = this.db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.id, projectId))
            .get();
        return row !== undefined;
    }

    insert(item: WorkItem): void {
        insertItem(this.db, item);
    }

    update(item: WorkItem): void {
        updateItem(this.db, item);
    }

    saveSyncBatch(batch: SyncBatch): void {
        this.db.transaction((transaction) => {
            for (const item of batch.inserts) {
                insertItem(transaction, item);
            }
            for (const item of batch.updates) {
                updateItem(transaction, item);
            }
        });
    }

    findById(id: string): WorkItem | undefined {
        const row = this.db.select().from(workItems).where(eq(workItems.id, id)).get();
        return row && toWorkItem(row);
    }

    listByProject(projectId: string): WorkItem[] {
        return this.db
            .select()
            .from(workItems)
            .where(eq(workItems.projectId, projectId))
            .orderBy(asc(workItems.createdAt), asc(workItems.id))
            .all()
            .map(toWorkItem);
    }

    listGithubItems(projectId: string): WorkItem[] {
        return this.db
            .select()
            .from(workItems)
            .where(and(eq(workItems.projectId, projectId), eq(workItems.source, "github")))
            .all()
            .map(toWorkItem);
    }
}

function insertItem(writer: WorkItemWriter, item: WorkItem): void {
    writer.insert(workItems).values(toWorkItemRow(item)).run();
}

function updateItem(writer: WorkItemWriter, item: WorkItem): void {
    writer.update(workItems).set(toWorkItemRow(item)).where(eq(workItems.id, item.id)).run();
}

function toWorkItemRow(item: WorkItem): WorkItemRow {
    return {
        id: item.id,
        projectId: item.projectId,
        source: item.source,
        number: item.number ?? null,
        url: item.url ?? null,
        title: item.title,
        body: item.body,
        labelsJson: JSON.stringify(item.labels),
        state: item.state,
        blockedByJson: JSON.stringify(item.blockedBy),
        branch: item.branch,
        manualColumn: item.manualColumn ?? null,
        archived: item.archived,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        syncedAt: item.syncedAt ?? null,
    };
}

function toWorkItem(row: WorkItemRow): WorkItem {
    return {
        id: row.id,
        projectId: row.projectId,
        source: sourceSchema.parse(row.source),
        number: row.number ?? undefined,
        url: row.url ?? undefined,
        title: row.title,
        body: row.body,
        labels: stringListSchema.parse(JSON.parse(row.labelsJson)),
        state: stateSchema.parse(row.state),
        blockedBy: stringListSchema.parse(JSON.parse(row.blockedByJson)),
        branch: row.branch,
        manualColumn: manualColumnSchema.optional().parse(row.manualColumn ?? undefined),
        archived: row.archived,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        syncedAt: row.syncedAt ?? undefined,
    };
}
