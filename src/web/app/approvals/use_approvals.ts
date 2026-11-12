import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type { Approval, ApprovalDecision, ApprovalListFilter } from "@/shared/approval_types.js";
import type { EventEnvelope, ForjaEventType } from "@/shared/events.js";
import type {
    SerializedArtifact,
    SerializedNodeRun,
    SerializedRunView,
} from "@/shared/run_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { useEventStream } from "@/web/api/use_event_stream.js";
import { fetchRunView } from "@/web/canvas/live/use_live_run.js";
import { fetchNodeRunDetail } from "@/web/canvas/live/use_node_run_detail.js";

export interface ApprovalResolution {
    approvalId: string;
    decision: ApprovalDecision;
    comment?: string;
}

export interface ApprovalArtifacts {
    artifacts: SerializedArtifact[];
    isLoading: boolean;
}

const APPROVALS_QUERY_KEY = "approvals";
const APPROVAL_RUN_QUERY_KEY = "approval-run";
const APPROVAL_ARTIFACTS_QUERY_KEY = "approval-artifacts";

const APPROVAL_EVENTS: ReadonlySet<ForjaEventType> = new Set<ForjaEventType>([
    "approval.requested",
    "approval.resolved",
]);

// Pending approvals change while the page is open, so they follow the event stream; the resolved
// list shares the key prefix and reloads with them.
export function usePendingApprovals(projectId: string): UseQueryResult<Approval[], ApiError> {
    useReloadApprovalsOnApprovalEvents(projectId);

    return useApprovals(projectId, "pending");
}

export function useResolvedApprovals(projectId: string): UseQueryResult<Approval[], ApiError> {
    return useApprovals(projectId, "resolved");
}

export function useResolveApproval(): UseMutationResult<Approval, ApiError, ApprovalResolution> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ approvalId, decision, comment }: ApprovalResolution) =>
            apiClient.post<Approval>(`/approvals/${encodeURIComponent(approvalId)}/resolve`, {
                decision,
                comment,
            }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [APPROVALS_QUERY_KEY] }),
    });
}

// The evidence for the reviewer (spec, Reviewer summary...) is what the item's earlier NodeRuns
// in the same run produced.
export function useApprovalArtifacts(approval: Approval): ApprovalArtifacts {
    const runView = useQuery<SerializedRunView, ApiError>({
        queryKey: [APPROVAL_RUN_QUERY_KEY, approval.runId],
        queryFn: () => fetchRunView(approval.runId),
    });
    const producingNodeRuns = listProducingNodeRuns(runView.data, approval);

    return useQueries({
        queries: producingNodeRuns.map((nodeRun) => ({
            queryKey: [APPROVAL_ARTIFACTS_QUERY_KEY, nodeRun.id],
            queryFn: () => fetchNodeRunDetail(nodeRun.id),
        })),
        combine: (details) => ({
            artifacts: details.flatMap((detail) => detail.data?.artifacts ?? []),
            isLoading: runView.isPending || details.some((detail) => detail.isPending),
        }),
    });
}

function useReloadApprovalsOnApprovalEvents(projectId: string): void {
    const queryClient = useQueryClient();
    const reloadOnApprovalEvent = (envelope: EventEnvelope): void => {
        if (APPROVAL_EVENTS.has(envelope.event.type)) {
            void queryClient.invalidateQueries({ queryKey: [APPROVALS_QUERY_KEY, projectId] });
        }
    };

    useEventStream({ projectId }, reloadOnApprovalEvent);
}

function useApprovals(
    projectId: string,
    filter: ApprovalListFilter,
): UseQueryResult<Approval[], ApiError> {
    return useQuery({
        queryKey: [APPROVALS_QUERY_KEY, projectId, filter],
        queryFn: () => apiClient.get<Approval[]>(projectApprovalsPath(projectId, filter)),
    });
}

function listProducingNodeRuns(
    runView: SerializedRunView | undefined,
    approval: Approval,
): SerializedNodeRun[] {
    if (!runView) {
        return [];
    }

    return runView.nodeRuns.filter(
        (nodeRun) =>
            nodeRun.workItemId === approval.workItemId &&
            nodeRun.id !== approval.nodeRunId &&
            nodeRun.status === "SUCCEEDED",
    );
}

function projectApprovalsPath(projectId: string, filter: ApprovalListFilter): string {
    const query = new URLSearchParams({ status: filter });

    return `/projects/${encodeURIComponent(projectId)}/approvals?${query.toString()}`;
}
