import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const logIndex = sqliteTable("log_index", {
    nodeRunId: text("node_run_id").primaryKey(),
    runId: text("run_id").notNull(),
    count: integer("count").notNull(),
    bytes: integer("bytes").notNull(),
    updatedAt: text("updated_at").notNull(),
});

export type LogIndexRow = typeof logIndex.$inferSelect;

// The runs whose logs the retention removed, so reading them can say so instead of showing nothing.
export const expiredRunLogs = sqliteTable("expired_run_logs", {
    runId: text("run_id").primaryKey(),
    expiredAt: text("expired_at").notNull(),
});
