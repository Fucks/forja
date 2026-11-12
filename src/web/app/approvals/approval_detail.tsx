import { useState } from "react";
import type { JSX } from "react";
import { Link } from "react-router";

import { formatDateTime } from "@/lib/format.js";
import type { Approval, ApprovalDecision, ApprovalReviewSection } from "@/shared/approval_types.js";
import { ApprovalStatusBadge } from "@/web/app/approvals/approval_status.js";
import { DiffViewer } from "@/web/app/approvals/diff_viewer.js";
import { useApprovalArtifacts, useResolveApproval } from "@/web/app/approvals/use_approvals.js";
import { NodeRunArtifacts } from "@/web/canvas/live/node_run_artifacts.js";
import { describeItem } from "@/web/canvas/live/run_view_model.js";
import { Button } from "@/web/components/ui/button.js";
import { Field } from "@/web/components/ui/field.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { Textarea } from "@/web/components/ui/textarea.js";
import { useFailureToast } from "@/web/components/ui/toast.js";
import { nodeRunPath } from "@/web/config/navigation.js";

const COMMENT_FIELD_ID = "approval-comment";
const MISSING_REJECTION_COMMENT = "Escreva um comentário para rejeitar.";
const RESOLVE_FAILURE_TITLE = "Não foi possível resolver a aprovação";

export function ApprovalDetail({
    projectId,
    approval,
}: {
    projectId: string;
    approval: Approval;
}): JSX.Element {
    const asksToShow = (section: ApprovalReviewSection): boolean => approval.show.includes(section);

    return (
        <article
            aria-label="Pedido de aprovação"
            className="flex min-w-0 flex-1 flex-col gap-5 overflow-auto"
        >
            <ApprovalHeader approval={approval} />
            {approval.status === "pending" ? (
                <ApprovalDecisionForm approval={approval} />
            ) : (
                <ApprovalOutcome approval={approval} />
            )}
            {asksToShow("diff") && <ApprovalDiff diff={approval.diff} />}
            {asksToShow("artifacts") && <ApprovalArtifactsSection approval={approval} />}
            {asksToShow("logs") && (
                <Link
                    to={nodeRunPath(projectId, approval.runId, approval.nodeRunId)}
                    className="text-sm text-accent underline"
                >
                    Ver logs da run
                </Link>
            )}
        </article>
    );
}

function ApprovalHeader({ approval }: { approval: Approval }): JSX.Element {
    return (
        <header className="flex flex-col gap-2">
            <div className="flex items-center gap-3 text-sm text-muted">
                <ApprovalStatusBadge status={approval.status} />
                {approval.workItemId && <span>{describeItem(approval.workItemId)}</span>}
                <span>{formatDateTime(new Date(approval.createdAt))}</span>
            </div>
            <h2 className="text-lg font-semibold whitespace-pre-wrap">{approval.message}</h2>
        </header>
    );
}

function ApprovalDecisionForm({ approval }: { approval: Approval }): JSX.Element {
    const form = useDecisionForm(approval);

    return (
        <section aria-label="Decisão" className="flex flex-col gap-3">
            <Field
                label="Comentário"
                htmlFor={COMMENT_FIELD_ID}
                hint="Obrigatório para rejeitar."
                error={form.commentError}
            >
                <Textarea
                    id={COMMENT_FIELD_ID}
                    value={form.comment}
                    onChange={(event) => form.changeComment(event.target.value)}
                />
            </Field>
            <div className="flex gap-2">
                <Button
                    variant="primary"
                    loading={form.isResolving}
                    onClick={() => form.decide("approved")}
                >
                    Aprovar
                </Button>
                <Button
                    variant="danger"
                    loading={form.isResolving}
                    onClick={() => form.decide("rejected")}
                >
                    Rejeitar
                </Button>
            </div>
        </section>
    );
}

interface DecisionForm {
    comment: string;
    commentError?: string;
    isResolving: boolean;
    changeComment: (comment: string) => void;
    decide: (decision: ApprovalDecision) => void;
}

// The gate sends the comment through its rejected port, so a rejection must explain itself.
function useDecisionForm(approval: Approval): DecisionForm {
    const [comment, setComment] = useState("");
    const [commentError, setCommentError] = useState<string>();
    const resolveApproval = useResolveApproval();
    const showFailure = useFailureToast();

    const decide = (decision: ApprovalDecision): void => {
        const trimmedComment = comment.trim();
        if (decision === "rejected" && trimmedComment === "") {
            setCommentError(MISSING_REJECTION_COMMENT);
            return;
        }

        resolveApproval.mutate(
            { approvalId: approval.id, decision, comment: trimmedComment || undefined },
            { onError: (error) => showFailure(RESOLVE_FAILURE_TITLE, error) },
        );
    };
    const changeComment = (changedComment: string): void => {
        setComment(changedComment);
        setCommentError(undefined);
    };

    return {
        comment,
        commentError,
        isResolving: resolveApproval.isPending,
        changeComment,
        decide,
    };
}

function ApprovalOutcome({ approval }: { approval: Approval }): JSX.Element {
    return (
        <section aria-label="Decisão" className="flex flex-col gap-1 text-sm">
            {approval.resolvedAt && (
                <p className="text-muted">
                    Resolvido em {formatDateTime(new Date(approval.resolvedAt))}
                </p>
            )}
            {approval.comment && <p className="whitespace-pre-wrap">{approval.comment}</p>}
        </section>
    );
}

function ApprovalDiff({ diff }: { diff?: string }): JSX.Element {
    return (
        <section aria-label="Diff" className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Diff</h3>
            {diff === undefined ? (
                <p className="text-sm text-muted">Este pedido não tem diff.</p>
            ) : (
                <DiffViewer diff={diff} />
            )}
        </section>
    );
}

function ApprovalArtifactsSection({ approval }: { approval: Approval }): JSX.Element {
    const { artifacts, isLoading } = useApprovalArtifacts(approval);

    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Artefatos</h3>
            {isLoading ? <Skeleton className="h-16" /> : <NodeRunArtifacts artifacts={artifacts} />}
        </section>
    );
}
