import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { projects } from "@/server/db/schema/projects.js";

export const workItems = sqliteTable(
    "work_items",
    {
        id: text("id").primaryKey(),
        projectId: text("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        source: text("source").notNull(),
        number: integer("number"),
        url: text("url"),
        title: text("title").notNull(),
        body: text("body").notNull(),
        labelsJson: text("labels_json").notNull(),
        state: text("state").notNull(),
        blockedByJson: text("blocked_by_json").notNull(),
        branch: text("branch").notNull(),
        manualColumn: text("manual_column"),
        archived: integer("archived", { mode: "boolean" }).notNull().default(false),
        createdAt: text("created_at").notNull(),
        updatedAt: text("updated_at").notNull(),
        syncedAt: text("synced_at"),
    },
    (table) => [unique().on(table.projectId, table.source, table.number)],
);

export type WorkItemRow = typeof workItems.$inferSelect;
