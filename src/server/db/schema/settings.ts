import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { projects } from "@/server/db/schema/projects.js";

export const projectSettings = sqliteTable("project_settings", {
    projectId: text("project_id")
        .primaryKey()
        .references(() => projects.id, { onDelete: "cascade" }),
    json: text("json").notNull(),
    updatedAt: text("updated_at").notNull(),
});

export const globalSettings = sqliteTable("global_settings", {
    id: text("id").primaryKey(),
    json: text("json").notNull(),
    updatedAt: text("updated_at").notNull(),
});
