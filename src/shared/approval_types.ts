import { z } from "zod";

import type { GATE_REVIEW_SECTIONS } from "@/shared/node_configs/gate_config.js";

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
export const APPROVAL_DECISIONS = ["approved", "rejected"] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];
export type ApprovalReviewSection = (typeof GATE_REVIEW_SECTIONS)[number];

export interface Approval {
    id: string;
    projectId: string;
    runId: string;
    nodeRunId: string;
    workItemId?: string;
    message: string;
    show: ApprovalReviewSection[];
    diff?: string;
    status: ApprovalStatus;
    comment?: string;
    createdAt: string;
    resolvedAt?: string;
    expiresAt?: string;
}

export type NewApproval = Omit<Approval, "id" | "status" | "createdAt">;

export const listApprovalsQuery = z.object({ status: z.literal("pending").default("pending") });

export const resolveApprovalInput = z.object({
    decision: z.enum(APPROVAL_DECISIONS),
    comment: z.string().optional(),
});

export type ResolveApprovalInput = z.infer<typeof resolveApprovalInput>;
