import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import type { RouteModule } from "@/server/route_modules.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import type { SettingsService } from "@/server/settings/settings_service.js";
import { globalSettingsSchema, projectSettingsSchema } from "@/shared/settings_types.js";

const PROJECT_SETTINGS_PATH = "/projects/:projectId/settings";
const GLOBAL_SETTINGS_PATH = "/settings";

const projectParamsSchema = z.object({ projectId: z.string().min(1) });

export const registerSettingsRoutes: RouteModule = (app, deps) => {
    const settings = createSettingsService({
        repo: new SettingsRepository(deps.db),
        lookups: createSettingsLookups(deps.db),
        clock: systemClock,
    });

    registerProjectSettingsRoutes(app, settings);
    registerGlobalSettingsRoutes(app, settings);
};

function registerProjectSettingsRoutes(app: FastifyInstance, settings: SettingsService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(PROJECT_SETTINGS_PATH, { schema: { params: projectParamsSchema } }, (request) =>
        settings.getProjectSettings(request.params.projectId),
    );

    typedApp.put(
        PROJECT_SETTINGS_PATH,
        { schema: { params: projectParamsSchema, body: projectSettingsSchema } },
        (request) => settings.saveProjectSettings(request.params.projectId, request.body),
    );
}

function registerGlobalSettingsRoutes(app: FastifyInstance, settings: SettingsService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(GLOBAL_SETTINGS_PATH, () => settings.getGlobalSettings());

    typedApp.put(GLOBAL_SETTINGS_PATH, { schema: { body: globalSettingsSchema } }, (request) =>
        settings.saveGlobalSettings(request.body),
    );
}
