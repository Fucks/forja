import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import type { ApprovalRepository } from "@/server/approvals/approval_repository.js";
import { ConflictError, NotFoundError } from "@/server/errors.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { Approval, ApprovalDecision, NewApproval } from "@/shared/approval_types.js";

export interface ApprovalService {
    create(input: NewApproval): Promise<Approval>;
    /** @throws ApprovalNotPendingError (409) when the approval is no longer pending */
    resolve(id: string, decision: ApprovalDecision, comment?: string): Promise<Approval>;
    listPending(projectId: string): Promise<Approval[]>;
    listResolved(projectId: string): Promise<Approval[]>;
    get(id: string): Promise<Approval>;
    // The gate stopped waiting without a decision: it timed out or its run was canceled.
    expireOfNodeRun(nodeRunId: string): Promise<void>;
}

export interface ApprovalServiceDeps {
    repo: ApprovalRepository;
    events: EventBus;
    clock: Clock;
}

export const MAX_RESOLVED_APPROVALS_LISTED = 50;

interface Resolution {
    id: string;
    decision: ApprovalDecision;
    comment?: string;
}

export class ApprovalNotPendingError extends ConflictError {
    constructor(approval: Approval) {
        super(`A aprovação ${approval.id} já foi encerrada (${approval.status}).`);
    }
}

export function createApprovalService(deps: ApprovalServiceDeps): ApprovalService {
    const { repo } = deps;

    return {
        create: (input) => resolveWith(() => createApproval(deps, input)),
        resolve: (id, decision, comment) =>
            resolveWith(() => resolveApproval(deps, { id, decision, comment })),
        listPending: (projectId) => resolveWith(() => repo.listByProject(projectId, "pending")),
        listResolved: (projectId) =>
            resolveWith(() => repo.listResolvedByProject(projectId, MAX_RESOLVED_APPROVALS_LISTED)),
        get: (id) => resolveWith(() => findApprovalOrThrow(repo, id)),
        expireOfNodeRun: (nodeRunId) => resolveWith(() => expireOfNodeRun(deps, nodeRunId)),
    };
}

function createApproval(deps: ApprovalServiceDeps, input: NewApproval): Approval {
    const approval: Approval = {
        ...input,
        id: newId("apv"),
        status: "pending",
        createdAt: deps.clock.now().toISOString(),
    };
    deps.repo.insert(approval);
    publishApprovalEvent(deps.events, "approval.requested", approval);

    return approval;
}

function resolveApproval(deps: ApprovalServiceDeps, resolution: Resolution): Approval {
    const approval = findApprovalOrThrow(deps.repo, resolution.id);
    if (approval.status !== "pending") {
        throw new ApprovalNotPendingError(approval);
    }

    return closeApproval(deps, {
        ...approval,
        status: resolution.decision,
        comment: resolution.comment,
    });
}

function expireOfNodeRun(deps: ApprovalServiceDeps, nodeRunId: string): void {
    const pending = deps.repo.findPendingOfNodeRun(nodeRunId);
    if (pending) {
        closeApproval(deps, { ...pending, status: "expired" });
    }
}

function closeApproval(deps: ApprovalServiceDeps, decided: Approval): Approval {
    const closed: Approval = { ...decided, resolvedAt: deps.clock.now().toISOString() };
    deps.repo.update(closed);
    publishApprovalEvent(deps.events, "approval.resolved", closed);

    return closed;
}

function findApprovalOrThrow(repo: ApprovalRepository, id: string): Approval {
    const approval = repo.findById(id);
    if (!approval) {
        throw new NotFoundError(`A aprovação ${id} não existe.`);
    }

    return approval;
}

function publishApprovalEvent(
    events: EventBus,
    type: "approval.requested" | "approval.resolved",
    approval: Approval,
): void {
    events.publish({
        type,
        projectId: approval.projectId,
        approvalId: approval.id,
        runId: approval.runId,
    });
}
