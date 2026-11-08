import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const toolProfiles = sqliteTable("tool_profiles", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    mcpServersJson: text("mcp_servers_json").notNull(),
    allowedToolsJson: text("allowed_tools_json").notNull(),
    disallowedToolsJson: text("disallowed_tools_json").notNull(),
    permissionMode: text("permission_mode").notNull(),
    indexCodegraphOnStart: integer("index_codegraph_on_start", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
});

export type ToolProfileRow = typeof toolProfiles.$inferSelect;
