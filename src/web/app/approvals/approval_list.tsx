import { clsx } from "clsx";
import type { JSX } from "react";
import { Link } from "react-router";

import { formatTimeAgo } from "@/lib/format.js";
import type { Approval } from "@/shared/approval_types.js";
import { APPROVAL_STATUS_LABELS } from "@/web/app/approvals/approval_status.js";
import { describeItem } from "@/web/canvas/live/run_view_model.js";
import { approvalPath } from "@/web/config/navigation.js";

export function ApprovalList({
    projectId,
    pending,
    resolved,
    selectedApprovalId,
}: {
    projectId: string;
    pending: Approval[];
    resolved: Approval[];
    selectedApprovalId: string;
}): JSX.Element {
    const listProps = { projectId, selectedApprovalId };

    return (
        <nav aria-label="Pedidos de aprovação" className="flex w-80 shrink-0 flex-col gap-4">
            <ApprovalListSection title="Pendentes" approvals={pending} {...listProps} />
            <ApprovalListSection title="Resolvidos" approvals={resolved} {...listProps} />
        </nav>
    );
}

function ApprovalListSection({
    title,
    approvals,
    projectId,
    selectedApprovalId,
}: {
    title: string;
    approvals: Approval[];
    projectId: string;
    selectedApprovalId: string;
}): JSX.Element | null {
    if (approvals.length === 0) {
        return null;
    }

    return (
        <section className="flex flex-col gap-1">
            <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h2>
            <ul aria-label={title} className="flex flex-col gap-1">
                {approvals.map((approval) => (
                    <li key={approval.id}>
                        <ApprovalLink
                            projectId={projectId}
                            approval={approval}
                            isSelected={approval.id === selectedApprovalId}
                        />
                    </li>
                ))}
            </ul>
        </section>
    );
}

function ApprovalLink({
    projectId,
    approval,
    isSelected,
}: {
    projectId: string;
    approval: Approval;
    isSelected: boolean;
}): JSX.Element {
    return (
        <Link
            to={approvalPath(projectId, approval.nodeRunId)}
            aria-current={isSelected ? "true" : undefined}
            className={clsx(
                "flex flex-col gap-0.5 rounded-sm border px-3 py-2 text-sm hover:bg-surface-raised",
                isSelected ? "border-accent bg-surface-raised" : "border-transparent",
            )}
        >
            <span className="truncate font-medium">{approval.message}</span>
            <span className="flex justify-between gap-2 text-xs text-muted">
                <span>{approval.workItemId && describeItem(approval.workItemId)}</span>
                <span>{describeListedState(approval)}</span>
            </span>
        </Link>
    );
}

// A pending approval shows how long it has been waiting; a resolved one, its decision.
function describeListedState(approval: Approval): string {
    if (approval.status !== "pending") {
        return APPROVAL_STATUS_LABELS[approval.status];
    }

    return formatTimeAgo(Date.now() - Date.parse(approval.createdAt));
}
