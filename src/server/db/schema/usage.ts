import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const usageRecords = sqliteTable("usage_records", {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    runId: text("run_id").notNull(),
    flowId: text("flow_id").notNull(),
    nodeId: text("node_id").notNull(),
    nodeRunId: text("node_run_id").notNull(),
    workItemId: text("work_item_id"),
    iteration: integer("iteration").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    cacheCreationTokens: integer("cache_creation_tokens").notNull(),
    costUsd: real("cost_usd").notNull(),
    priceEstimated: integer("price_estimated", { mode: "boolean" }).notNull(),
    at: text("at").notNull(),
});

export type UsageRecordRow = typeof usageRecords.$inferSelect;
