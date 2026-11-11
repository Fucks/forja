import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import type { AppDeps } from "@/server/app.js";
import { ApprovalRepository } from "@/server/approvals/approval_repository.js";
import {
    type ApprovalService,
    createApprovalService,
} from "@/server/approvals/approval_service.js";
import type { RouteModule } from "@/server/route_modules.js";
import type { Executor } from "@/server/runtime/executor.js";
import { listApprovalsQuery, resolveApprovalInput } from "@/shared/approval_types.js";

const PROJECT_APPROVALS_PATH = "/projects/:projectId/approvals";
const APPROVAL_PATH = "/approvals/:id";
const RESOLVE_APPROVAL_PATH = `${APPROVAL_PATH}/resolve`;

const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const approvalParamsSchema = z.object({ id: z.string().min(1) });

export const registerApprovalsRoutes: RouteModule = (app, deps) => {
    const approvals = createApprovalsOf(deps);

    registerReadRoutes(app, approvals);
    registerResolveRoute(app, deps.executor);
};

function createApprovalsOf(deps: AppDeps): ApprovalService {
    return createApprovalService({
        repo: new ApprovalRepository(deps.db),
        events: deps.events,
        clock: systemClock,
    });
}

function registerReadRoutes(app: FastifyInstance, approvals: ApprovalService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(
        PROJECT_APPROVALS_PATH,
        { schema: { params: projectParamsSchema, querystring: listApprovalsQuery } },
        (request) => approvals.listPending(request.params.projectId),
    );

    typedApp.get(APPROVAL_PATH, { schema: { params: approvalParamsSchema } }, (request) =>
        approvals.get(request.params.id),
    );
}

// The executor resolves it, so the gate waiting for the approval goes on right away.
function registerResolveRoute(app: FastifyInstance, executor: Executor): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post(
        RESOLVE_APPROVAL_PATH,
        { schema: { params: approvalParamsSchema, body: resolveApprovalInput } },
        (request) => {
            const { decision, comment } = request.body;
            return executor.resolveApproval(request.params.id, decision, comment);
        },
    );
}
