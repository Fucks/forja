import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    flowId: text("flow_id").notNull(),
    flowVersion: integer("flow_version").notNull(),
    status: text("status").notNull(),
    pauseReason: text("pause_reason"),
    resumeAt: text("resume_at"),
    triggerId: text("trigger_id"),
    itemIdsJson: text("item_ids_json").notNull(),
    failedItemIdsJson: text("failed_item_ids_json").notNull(),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
});

export type RunRow = typeof runs.$inferSelect;

export const nodeRuns = sqliteTable("node_runs", {
    id: text("id").primaryKey(),
    runId: text("run_id")
        .notNull()
        .references(() => runs.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    workItemId: text("work_item_id"),
    iteration: integer("iteration").notNull(),
    attempt: integer("attempt").notNull(),
    groupPathJson: text("group_path_json").notNull(),
    status: text("status").notNull(),
    errorJson: text("error_json"),
    inputsJson: text("inputs_json"),
    outputsJson: text("outputs_json"),
    queuedAt: text("queued_at"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
});

export type NodeRunRow = typeof nodeRuns.$inferSelect;

export const artifacts = sqliteTable("artifacts", {
    id: text("id").primaryKey(),
    runId: text("run_id")
        .notNull()
        .references(() => runs.id, { onDelete: "cascade" }),
    nodeRunId: text("node_run_id")
        .notNull()
        .references(() => nodeRuns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    valueJson: text("value_json").notNull(),
    createdAt: text("created_at").notNull(),
});

export type ArtifactRow = typeof artifacts.$inferSelect;

export const runSnapshots = sqliteTable("run_snapshots", {
    runId: text("run_id")
        .primaryKey()
        .references(() => runs.id, { onDelete: "cascade" }),
    json: text("json").notNull(),
    updatedAt: text("updated_at").notNull(),
});
