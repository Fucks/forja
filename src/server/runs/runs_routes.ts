import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import { createAppFlowService } from "@/server/flows/app_flow_service.js";
import type { RouteModule } from "@/server/route_modules.js";
import { createRunService, type RunService } from "@/server/runs/run_service.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { listRunsQuery, raiseRunBudgetInput, startRunInput } from "@/shared/run_types.js";

const PROJECT_RUNS_PATH = "/projects/:projectId/runs";
const RUN_PATH = "/runs/:runId";
const RUN_BUDGET_PATH = `${RUN_PATH}/budget`;
const NODE_RUN_PATH = "/node-runs/:nodeRunId";
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const runParamsSchema = z.object({ runId: z.string().min(1) });
const nodeRunParamsSchema = z.object({ nodeRunId: z.string().min(1) });

type ActionOnTarget = (id: string) => Promise<void>;

export const registerRunsRoutes: RouteModule = (app, deps) => {
    const runs = createRunService({
        executor: deps.executor,
        runs: new SqliteRunRepository(deps.db, systemClock),
        flows: createAppFlowService({ db: deps.db, events: deps.events, clock: systemClock }),
        events: deps.events,
    });

    registerProjectRunsRoutes(app, runs);
    registerRunRoutes(app, runs);
    registerNodeRunRoutes(app, runs);
};

function registerProjectRunsRoutes(app: FastifyInstance, runs: RunService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(
        PROJECT_RUNS_PATH,
        { schema: { params: projectParamsSchema, querystring: listRunsQuery } },
        (request) => runs.listRuns(request.params.projectId, request.query),
    );

    typedApp.post(
        PROJECT_RUNS_PATH,
        { schema: { params: projectParamsSchema, body: startRunInput } },
        async (request, reply) => {
            const run = await runs.startRun(request.params.projectId, request.body);
            return reply.code(HTTP_CREATED).send(run);
        },
    );
}

function registerRunRoutes(app: FastifyInstance, runs: RunService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(RUN_PATH, { schema: { params: runParamsSchema } }, (request) =>
        runs.getRunView(request.params.runId),
    );

    const runActions: Record<string, ActionOnTarget> = {
        pause: (runId) => runs.pauseRun(runId),
        resume: (runId) => runs.resumeRun(runId),
        cancel: (runId) => runs.cancelRun(runId),
    };
    for (const [actionName, perform] of Object.entries(runActions)) {
        typedApp.post(
            `${RUN_PATH}/${actionName}`,
            { schema: { params: runParamsSchema } },
            async (request, reply) => {
                await perform(request.params.runId);
                return reply.code(HTTP_NO_CONTENT).send();
            },
        );
    }

    typedApp.post(
        RUN_BUDGET_PATH,
        { schema: { params: runParamsSchema, body: raiseRunBudgetInput } },
        async (request, reply) => {
            await runs.raiseRunBudget(request.params.runId, request.body);
            return reply.code(HTTP_NO_CONTENT).send();
        },
    );
}

function registerNodeRunRoutes(app: FastifyInstance, runs: RunService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(NODE_RUN_PATH, { schema: { params: nodeRunParamsSchema } }, (request) =>
        runs.getNodeRun(request.params.nodeRunId),
    );

    const nodeRunActions: Record<string, ActionOnTarget> = {
        cancel: (nodeRunId) => runs.cancelNodeRun(nodeRunId),
        retry: (nodeRunId) => runs.retryNodeRun(nodeRunId),
    };
    for (const [actionName, perform] of Object.entries(nodeRunActions)) {
        typedApp.post(
            `${NODE_RUN_PATH}/${actionName}`,
            { schema: { params: nodeRunParamsSchema } },
            async (request, reply) => {
                await perform(request.params.nodeRunId);
                return reply.code(HTTP_NO_CONTENT).send();
            },
        );
    }
}
