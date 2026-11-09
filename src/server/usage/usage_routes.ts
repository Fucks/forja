import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import type { RouteModule } from "@/server/route_modules.js";
import { findRunOrThrow } from "@/server/runs/run_service.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import { createAppUsageService } from "@/server/usage/app_usage_service.js";
import { usageQueryParams } from "@/shared/usage_types.js";

const PROJECT_USAGE_PATH = "/projects/:projectId/usage";
const RUN_USAGE_PATH = "/runs/:runId/usage";

const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const runParamsSchema = z.object({ runId: z.string().min(1) });

export const registerUsageRoutes: RouteModule = (app, deps) => {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();
    const runs = new SqliteRunRepository(deps.db, systemClock);
    const settings = createSettingsService({
        repo: new SettingsRepository(deps.db),
        lookups: createSettingsLookups(deps.db),
        clock: systemClock,
    });
    const usage = createAppUsageService({ db: deps.db, settings, clock: systemClock });

    typedApp.get(
        PROJECT_USAGE_PATH,
        { schema: { params: projectParamsSchema, querystring: usageQueryParams } },
        (request) => usage.aggregate({ projectId: request.params.projectId, ...request.query }),
    );

    typedApp.get(RUN_USAGE_PATH, { schema: { params: runParamsSchema } }, async (request) => {
        const { runId } = request.params;
        await findRunOrThrow(runs, runId);

        return usage.forRun(runId);
    });
};
