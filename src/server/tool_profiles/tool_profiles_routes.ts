import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import type { RouteModule } from "@/server/route_modules.js";
import { ToolProfileRepository } from "@/server/tool_profiles/tool_profile_repository.js";
import { createToolProfileService } from "@/server/tool_profiles/tool_profile_service.js";
import type { ToolProfileService } from "@/server/tool_profiles/tool_profile_service.js";
import { toolProfileInput } from "@/shared/tool_profile_types.js";

const TOOL_PROFILES_PATH = "/tool-profiles";
const TOOL_PROFILE_PATH = "/tool-profiles/:id";
const TOOL_PROFILE_DUPLICATE_PATH = `${TOOL_PROFILE_PATH}/duplicate`;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

const toolProfileParamsSchema = z.object({ id: z.string().min(1) });

export const registerToolProfilesRoutes: RouteModule = (app, deps) => {
    const toolProfiles = createToolProfileService({
        repo: new ToolProfileRepository(deps.db),
        clock: systemClock,
    });

    registerCollectionRoutes(app, toolProfiles);
    registerToolProfileRoutes(app, toolProfiles);
};

function registerCollectionRoutes(app: FastifyInstance, toolProfiles: ToolProfileService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(TOOL_PROFILES_PATH, () => toolProfiles.list());

    typedApp.post(
        TOOL_PROFILES_PATH,
        { schema: { body: toolProfileInput } },
        async (request, reply) => {
            const profile = await toolProfiles.create(request.body);
            return reply.code(HTTP_CREATED).send(profile);
        },
    );
}

function registerToolProfileRoutes(app: FastifyInstance, toolProfiles: ToolProfileService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(TOOL_PROFILE_PATH, { schema: { params: toolProfileParamsSchema } }, (request) =>
        toolProfiles.get(request.params.id),
    );

    typedApp.put(
        TOOL_PROFILE_PATH,
        { schema: { params: toolProfileParamsSchema, body: toolProfileInput } },
        (request) => toolProfiles.update(request.params.id, request.body),
    );

    typedApp.delete(
        TOOL_PROFILE_PATH,
        { schema: { params: toolProfileParamsSchema } },
        async (request, reply) => {
            await toolProfiles.remove(request.params.id);
            return reply.code(HTTP_NO_CONTENT).send();
        },
    );

    typedApp.post(
        TOOL_PROFILE_DUPLICATE_PATH,
        { schema: { params: toolProfileParamsSchema } },
        async (request, reply) => {
            const copy = await toolProfiles.duplicate(request.params.id);
            return reply.code(HTTP_CREATED).send(copy);
        },
    );
}
