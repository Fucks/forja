import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const auditLog = sqliteTable("audit_log", {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    detailsJson: text("details_json").notNull(),
    createdAt: text("created_at").notNull(),
});

export type AuditLogRow = typeof auditLog.$inferSelect;
