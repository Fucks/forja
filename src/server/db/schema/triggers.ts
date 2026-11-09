import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { flows } from "@/server/db/schema/flows.js";
import { projects } from "@/server/db/schema/projects.js";

export const triggers = sqliteTable("triggers", {
    id: text("id").primaryKey(),
    projectId: text("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "cascade" }),
    flowId: text("flow_id")
        .notNull()
        .references(() => flows.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    policy: text("policy").notNull(),
    itemSelection: text("item_selection").notNull(),
    kind: text("kind").notNull(),
    configJson: text("config_json").notNull(),
    createdAt: text("created_at").notNull(),
    lastFiredAt: text("last_fired_at"),
});

export type TriggerRow = typeof triggers.$inferSelect;

export const triggerFires = sqliteTable("trigger_fires", {
    id: text("id").primaryKey(),
    triggerId: text("trigger_id")
        .notNull()
        .references(() => triggers.id, { onDelete: "cascade" }),
    at: text("at").notNull(),
    outcome: text("outcome").notNull(),
    runId: text("run_id"),
    message: text("message"),
    reason: text("reason").notNull(),
    itemIdsJson: text("item_ids_json").notNull(),
});

export type TriggerFireRow = typeof triggerFires.$inferSelect;
