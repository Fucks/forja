import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const logIndex = sqliteTable("log_index", {
    nodeRunId: text("node_run_id").primaryKey(),
    runId: text("run_id").notNull(),
    count: integer("count").notNull(),
    bytes: integer("bytes").notNull(),
    updatedAt: text("updated_at").notNull(),
});

export type LogIndexRow = typeof logIndex.$inferSelect;
