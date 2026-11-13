import { existsSync } from "node:fs";

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { NodeRunState } from "@/engine/node_run_state.js";
import { systemClock } from "@/lib/clock.js";
import { hostTimeZone } from "@/lib/local_day.js";
import type { AppDeps } from "@/server/app.js";
import { describeAttachment } from "@/server/attachment_header.js";
import { GoneError } from "@/server/errors.js";
import { createCleanupJob, type CleanupJob } from "@/server/maintenance/cleanup_job.js";
import { runCleanup } from "@/server/maintenance/cleanup_service.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import type { RouteModule } from "@/server/route_modules.js";
import type { RunRepository } from "@/server/runs/run_repository.js";
import { findNodeRunOrThrow } from "@/server/runs/run_service.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { LOG_FILE_EXTENSION, type LogStore } from "@/server/runtime/log_store.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import { logPageQuery } from "@/shared/log_types.js";

const NODE_RUN_LOGS_PATH = "/node-runs/:nodeRunId/logs";
const RAW_NODE_RUN_LOGS_PATH = `${NODE_RUN_LOGS_PATH}/raw`;
const MAINTENANCE_CLEANUP_PATH = "/maintenance/cleanup";
const RAW_LOGS_CONTENT_TYPE = "text/plain; charset=utf-8";
const LOGS_EXPIRED_CODE = "logs_expired";
const LOGS_EXPIRED_MESSAGE = "Logs removidos pela política de retenção";

const nodeRunParamsSchema = z.object({ nodeRunId: z.string().min(1) });

export const registerLogsRoutes: RouteModule = (app, deps) => {
    const runs = new SqliteRunRepository(deps.db, systemClock);
    const cleanupJob = createAppCleanupJob(app, deps, runs);

    registerNodeRunLogsRoutes(app, runs, deps.logs);
    registerMaintenanceRoutes(app, cleanupJob);
    runCleanupJobWhileAppIsUp(app, cleanupJob);
};

function registerNodeRunLogsRoutes(
    app: FastifyInstance,
    runs: RunRepository,
    logs: LogStore,
): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(
        NODE_RUN_LOGS_PATH,
        { schema: { params: nodeRunParamsSchema, querystring: logPageQuery } },
        async (request) => {
            const { nodeRunId } = request.params;
            await findNodeRunWithLogsOrThrow(runs, logs, nodeRunId);

            return logs.read(nodeRunId, request.query);
        },
    );

    typedApp.get(
        RAW_NODE_RUN_LOGS_PATH,
        { schema: { params: nodeRunParamsSchema } },
        async (request, reply) => {
            const { nodeRunId } = request.params;
            await findNodeRunWithLogsOrThrow(runs, logs, nodeRunId);

            return reply
                .type(RAW_LOGS_CONTENT_TYPE)
                .header("content-disposition", describeAttachment(nodeRunId + LOG_FILE_EXTENSION))
                .send(logs.rawStream(nodeRunId));
        },
    );
}

/** @throws NotFoundError, GoneError when the retention removed the logs */
async function findNodeRunWithLogsOrThrow(
    runs: RunRepository,
    logs: LogStore,
    nodeRunId: string,
): Promise<NodeRunState> {
    const nodeRun = await findNodeRunOrThrow(runs, nodeRunId);
    if (await logs.hasExpired({ runId: nodeRun.runId, nodeRunId })) {
        throw new GoneError(LOGS_EXPIRED_CODE, LOGS_EXPIRED_MESSAGE);
    }

    return nodeRun;
}

function registerMaintenanceRoutes(app: FastifyInstance, cleanupJob: CleanupJob): void {
    app.post(MAINTENANCE_CLEANUP_PATH, () => cleanupJob.runNow());
}

function runCleanupJobWhileAppIsUp(app: FastifyInstance, cleanupJob: CleanupJob): void {
    app.addHook("onReady", (done) => {
        cleanupJob.start();
        done();
    });
    app.addHook("onClose", (_closingApp, done) => {
        cleanupJob.stop();
        done();
    });
}

function createAppCleanupJob(app: FastifyInstance, deps: AppDeps, runs: RunRepository): CleanupJob {
    const settings = createSettingsService({
        repo: new SettingsRepository(deps.db),
        lookups: createSettingsLookups(deps.db),
        clock: systemClock,
    });
    const projects = createProjectService({
        repo: new ProjectRepository(deps.db),
        git: deps.git,
        fileExists: existsSync,
        clock: systemClock,
    });
    const cleanupDeps = {
        logs: deps.logs,
        runs,
        settings,
        projects,
        git: deps.git,
        clock: systemClock,
        runtime: deps.agentRuntime,
        worktreesDir: deps.paths.worktrees,
    };

    return createCleanupJob({
        clock: systemClock,
        timezone: hostTimeZone(),
        cleanup: () => runCleanup(cleanupDeps),
        log: (message) => app.log.info(message),
    });
}
