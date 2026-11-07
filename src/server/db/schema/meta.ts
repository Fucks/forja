import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appliedMigrations = sqliteTable("_migrations", {
    id: text("id").primaryKey(),
    appliedAt: text("applied_at").notNull(),
});

export const appMeta = sqliteTable("app_meta", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
});
