import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const credentials = sqliteTable("credentials", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    envVar: text("env_var").notNull(),
    sealedValue: text("sealed_value").notNull(),
    masked: text("masked").notNull(),
    lastCheckedAt: text("last_checked_at"),
    lastCheckOk: integer("last_check_ok", { mode: "boolean" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
});

export type CredentialRow = typeof credentials.$inferSelect;
