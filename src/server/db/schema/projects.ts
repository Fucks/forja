import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    repoPath: text("repo_path").notNull().unique(),
    githubRepo: text("github_repo"),
    baseBranch: text("base_branch").notNull(),
    detectedJson: text("detected_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
});

export type ProjectRow = typeof projects.$inferSelect;
