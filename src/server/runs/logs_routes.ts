import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import type { RouteModule } from "@/server/route_modules.js";
import { findNodeRunOrThrow } from "@/server/runs/run_service.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { logPageQuery } from "@/shared/log_types.js";

const NODE_RUN_LOGS_PATH = "/node-runs/:nodeRunId/logs";
const RAW_NODE_RUN_LOGS_PATH = `${NODE_RUN_LOGS_PATH}/raw`;
const RAW_LOGS_CONTENT_TYPE = "text/plain; charset=utf-8";
const LOG_FILE_EXTENSION = ".ndjson";

const nodeRunParamsSchema = z.object({ nodeRunId: z.string().min(1) });

export const registerLogsRoutes: RouteModule = (app, deps) => {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();
    const runs = new SqliteRunRepository(deps.db, systemClock);

    typedApp.get(
        NODE_RUN_LOGS_PATH,
        { schema: { params: nodeRunParamsSchema, querystring: logPageQuery } },
        async (request) => {
            const { nodeRunId } = request.params;
            await findNodeRunOrThrow(runs, nodeRunId);

            return deps.logs.read(nodeRunId, request.query);
        },
    );

    typedApp.get(
        RAW_NODE_RUN_LOGS_PATH,
        { schema: { params: nodeRunParamsSchema } },
        async (request, reply) => {
            const { nodeRunId } = request.params;
            await findNodeRunOrThrow(runs, nodeRunId);

            return reply
                .type(RAW_LOGS_CONTENT_TYPE)
                .header("content-disposition", attachmentNamed(nodeRunId + LOG_FILE_EXTENSION))
                .send(deps.logs.rawStream(nodeRunId));
        },
    );
};

function attachmentNamed(fileName: string): string {
    return `attachment; filename="${fileName}"`;
}
