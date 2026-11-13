import { desc } from "drizzle-orm";
import { z } from "zod";

import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import type { ForjaDb } from "@/server/db/client.js";
import { auditLog, type AuditLogRow } from "@/server/db/schema/audit_log.js";

const AUDIT_ACTIONS = [
    "flow.published",
    "credential.created",
    "credential.updated",
    "credential.deleted",
    "approval.resolved",
    "run.canceled",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditTarget {
    kind: string;
    id: string;
}

export interface AuditLog {
    record(
        action: AuditAction,
        target: AuditTarget,
        details?: Record<string, unknown>,
    ): Promise<void>;
    list(limit: number): Promise<unknown[]>;
}

interface AuditEntry {
    id: string;
    action: AuditAction;
    target: AuditTarget;
    details: Record<string, unknown>;
    createdAt: string;
}

interface AuditLogDeps {
    db: ForjaDb;
    clock: Clock;
}

const actionSchema = z.enum(AUDIT_ACTIONS);
const detailsSchema = z.record(z.string(), z.unknown());

export function createAuditLog(deps: AuditLogDeps): AuditLog {
    return {
        record: (action, target, details = {}) =>
            resolveWith(() => insertEntry(deps, { action, target, details })),
        list: (limit) => resolveWith(() => listNewestEntries(deps.db, limit)),
    };
}

function insertEntry(deps: AuditLogDeps, entry: Omit<AuditEntry, "id" | "createdAt">): void {
    deps.db
        .insert(auditLog)
        .values({
            id: newId("aud"),
            action: entry.action,
            targetKind: entry.target.kind,
            targetId: entry.target.id,
            detailsJson: JSON.stringify(entry.details),
            createdAt: deps.clock.now().toISOString(),
        })
        .run();
}

// The ids are monotonic, so they also order the entries recorded in the same instant.
function listNewestEntries(db: ForjaDb, limit: number): AuditEntry[] {
    const rows = db
        .select()
        .from(auditLog)
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(limit)
        .all();

    return rows.map(toAuditEntry);
}

function toAuditEntry(row: AuditLogRow): AuditEntry {
    return {
        id: row.id,
        action: actionSchema.parse(row.action),
        target: { kind: row.targetKind, id: row.targetId },
        details: detailsSchema.parse(JSON.parse(row.detailsJson)),
        createdAt: row.createdAt,
    };
}
