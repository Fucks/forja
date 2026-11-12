import { and, asc, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import type { ForjaDb } from "@/server/db/client.js";
import { type ApprovalRow, approvals } from "@/server/db/schema/approvals.js";
import { type Approval, APPROVAL_STATUSES, type ApprovalStatus } from "@/shared/approval_types.js";
import { GATE_REVIEW_SECTIONS } from "@/shared/node_configs/gate_config.js";

const statusSchema = z.enum(APPROVAL_STATUSES);
const showSchema = z.array(z.enum(GATE_REVIEW_SECTIONS));

export class ApprovalRepository {
    constructor(private readonly db: ForjaDb) {}

    insert(approval: Approval): void {
        this.db.insert(approvals).values(toApprovalRow(approval)).run();
    }

    update(approval: Approval): void {
        this.db
            .update(approvals)
            .set(toApprovalRow(approval))
            .where(eq(approvals.id, approval.id))
            .run();
    }

    findById(id: string): Approval | undefined {
        const row = this.db.select().from(approvals).where(eq(approvals.id, id)).get();
        return row && toApproval(row);
    }

    findPendingOfNodeRun(nodeRunId: string): Approval | undefined {
        const row = this.db
            .select()
            .from(approvals)
            .where(and(eq(approvals.nodeRunId, nodeRunId), eq(approvals.status, "pending")))
            .get();
        return row && toApproval(row);
    }

    listByProject(projectId: string, status: ApprovalStatus): Approval[] {
        return this.db
            .select()
            .from(approvals)
            .where(and(eq(approvals.projectId, projectId), eq(approvals.status, status)))
            .orderBy(asc(approvals.createdAt), asc(approvals.id))
            .all()
            .map(toApproval);
    }

    listResolvedByProject(projectId: string, limit: number): Approval[] {
        return this.db
            .select()
            .from(approvals)
            .where(and(eq(approvals.projectId, projectId), ne(approvals.status, "pending")))
            .orderBy(desc(approvals.resolvedAt), desc(approvals.id))
            .limit(limit)
            .all()
            .map(toApproval);
    }
}

function toApprovalRow(approval: Approval): ApprovalRow {
    return {
        id: approval.id,
        projectId: approval.projectId,
        runId: approval.runId,
        nodeRunId: approval.nodeRunId,
        workItemId: approval.workItemId ?? null,
        message: approval.message,
        showJson: JSON.stringify(approval.show),
        diff: approval.diff ?? null,
        status: approval.status,
        comment: approval.comment ?? null,
        createdAt: approval.createdAt,
        resolvedAt: approval.resolvedAt ?? null,
        expiresAt: approval.expiresAt ?? null,
    };
}

function toApproval(row: ApprovalRow): Approval {
    return {
        id: row.id,
        projectId: row.projectId,
        runId: row.runId,
        nodeRunId: row.nodeRunId,
        workItemId: row.workItemId ?? undefined,
        message: row.message,
        show: showSchema.parse(JSON.parse(row.showJson)),
        diff: row.diff ?? undefined,
        status: statusSchema.parse(row.status),
        comment: row.comment ?? undefined,
        createdAt: row.createdAt,
        resolvedAt: row.resolvedAt ?? undefined,
        expiresAt: row.expiresAt ?? undefined,
    };
}
