import { ClipboardCheck, TriangleAlert } from "lucide-react";
import type { JSX } from "react";
import { useParams, useSearchParams } from "react-router";

import type { Approval } from "@/shared/approval_types.js";
import { ApprovalDetail } from "@/web/app/approvals/approval_detail.js";
import { ApprovalList } from "@/web/app/approvals/approval_list.js";
import { usePendingApprovals, useResolvedApprovals } from "@/web/app/approvals/use_approvals.js";
import { PageTitle } from "@/web/app/page_title.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { OPEN_NODE_RUN_PARAM } from "@/web/config/navigation.js";

export function ApprovalsPage(): JSX.Element {
    const { projectId = "" } = useParams();

    return (
        <div className="flex h-full flex-col gap-4">
            <PageTitle>Aprovações</PageTitle>
            <ApprovalsPageContent projectId={projectId} />
        </div>
    );
}

function ApprovalsPageContent({ projectId }: { projectId: string }): JSX.Element {
    const pending = usePendingApprovals(projectId);
    const resolved = useResolvedApprovals(projectId);
    const [searchParams] = useSearchParams();
    const error = pending.error ?? resolved.error;
    if (error) {
        return (
            <EmptyState
                icon={TriangleAlert}
                title="Não foi possível carregar as aprovações"
                description={error.message}
            />
        );
    }
    if (!pending.data || !resolved.data) {
        return <Skeleton className="h-64" />;
    }

    const selected = findSelectedApproval(
        [...pending.data, ...resolved.data],
        searchParams.get(OPEN_NODE_RUN_PARAM),
    );
    if (!selected) {
        return (
            <EmptyState
                icon={ClipboardCheck}
                title="Nenhum pedido de aprovação"
                description="Os pedidos dos nós gate deste projeto aparecem aqui."
            />
        );
    }

    return (
        <div className="flex min-h-0 flex-1 gap-6">
            <ApprovalList
                projectId={projectId}
                pending={pending.data}
                resolved={resolved.data}
                selectedApprovalId={selected.id}
            />
            <ApprovalDetail key={selected.id} projectId={projectId} approval={selected} />
        </div>
    );
}

// Without a choice in the URL, the first listed approval (the oldest pending one) is shown.
function findSelectedApproval(
    approvals: Approval[],
    gateNodeRunId: string | null,
): Approval | undefined {
    return approvals.find((approval) => approval.nodeRunId === gateNodeRunId) ?? approvals[0];
}
