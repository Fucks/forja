import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { projects } from "@/server/db/schema/projects.js";
import { runs } from "@/server/db/schema/runs.js";

export const approvals = sqliteTable("approvals", {
    id: text("id").primaryKey(),
    projectId: text("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id")
        .notNull()
        .references(() => runs.id, { onDelete: "cascade" }),
    nodeRunId: text("node_run_id").notNull(),
    workItemId: text("work_item_id"),
    message: text("message").notNull(),
    showJson: text("show_json").notNull(),
    diff: text("diff"),
    status: text("status").notNull(),
    comment: text("comment"),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
    expiresAt: text("expires_at"),
});

export type ApprovalRow = typeof approvals.$inferSelect;
