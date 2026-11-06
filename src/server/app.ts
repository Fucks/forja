import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { Env } from "@/lib/env.js";
import type { ForjaPaths } from "@/lib/paths.js";
import { routeModules } from "@/server/route_modules.js";

const API_PREFIX = "/api";

export interface ServerOptions {
    seedDemo: boolean;
}

export interface AppDeps {
    env: Env;
    paths: ForjaPaths;
    options: ServerOptions;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
    const app = Fastify({ logger: { level: deps.env.FORJA_LOG_LEVEL } });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    await registerRouteModules(app.withTypeProvider<ZodTypeProvider>(), deps);

    return app;
}

async function registerRouteModules(app: FastifyInstance, deps: AppDeps): Promise<void> {
    for (const registerRoutes of routeModules) {
        await app.register((scope) => registerRoutes(scope, deps), { prefix: API_PREFIX });
    }
}
