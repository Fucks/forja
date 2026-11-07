import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { projects } from "@/server/db/schema/projects.js";

export const flows = sqliteTable("flows", {
    id: text("id").primaryKey(),
    projectId: text("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    draftJson: text("draft_json").notNull(),
    draftRevision: integer("draft_revision").notNull(),
    draftUpdatedAt: text("draft_updated_at").notNull(),
    createdAt: text("created_at").notNull(),
});

export type FlowRow = typeof flows.$inferSelect;

export const flowVersions = sqliteTable(
    "flow_versions",
    {
        flowId: text("flow_id")
            .notNull()
            .references(() => flows.id, { onDelete: "cascade" }),
        version: integer("version").notNull(),
        graphJson: text("graph_json").notNull(),
        publishedAt: text("published_at").notNull(),
        note: text("note"),
    },
    (table) => [primaryKey({ columns: [table.flowId, table.version] })],
);

export type FlowVersionRow = typeof flowVersions.$inferSelect;
