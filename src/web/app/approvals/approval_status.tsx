import type { JSX } from "react";

import type { ApprovalStatus } from "@/shared/approval_types.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
    pending: "Aguardando aprovação",
    approved: "Aprovado",
    rejected: "Rejeitado",
    expired: "Expirado",
};

const DECIDED_STATUS_COLOR_VARS: Record<Exclude<ApprovalStatus, "pending">, string> = {
    approved: "--status-succeeded",
    rejected: "--status-failed",
    expired: "--status-canceled",
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }): JSX.Element {
    if (status === "pending") {
        return <StatusBadge status="WAITING_APPROVAL" size="sm" />;
    }

    return (
        <span
            className="inline-flex items-center rounded-sm border border-current px-1.5 py-0.5 text-xs font-medium"
            style={{ color: `var(${DECIDED_STATUS_COLOR_VARS[status]})` }}
        >
            {APPROVAL_STATUS_LABELS[status]}
        </span>
    );
}
