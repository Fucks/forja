import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { GitProvider } from "@/integrations/git/git_provider.js";
import type { CommandRunner } from "@/integrations/process/command_runner.js";
import type { SecretBox } from "@/integrations/secrets/secret_box.js";
import type { SecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import type { Env } from "@/lib/env.js";
import type { ForjaPaths } from "@/lib/paths.js";
import type { ForjaDb } from "@/server/db/client.js";
import { registerErrorHandler } from "@/server/errors.js";
import { routeModules } from "@/server/route_modules.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { Executor } from "@/server/runtime/executor.js";
import type { LogStore } from "@/server/runtime/log_store.js";
import { type ApiProtection, protectApi } from "@/server/security/api_protection.js";
import { addSecurityHeaders } from "@/server/security/security_headers.js";
import { registerStaticRoutes } from "@/server/static/static_routes.js";

const API_PREFIX = "/api";

// The SPA is served from the root, so its module is the only one mounted outside the API prefix.
const apiRouteModules = routeModules.filter(
    (registerRoutes) => registerRoutes !== registerStaticRoutes,
);

export interface ServerOptions {
    seedDemo: boolean;
}

export interface AppDeps {
    env: Env;
    paths: ForjaPaths;
    options: ServerOptions;
    db: ForjaDb;
    events: EventBus;
    commands: CommandRunner;
    git: GitProvider;
    secrets: SecretBox;
    redactor: SecretRedactor;
    logs: LogStore;
    agentRuntime: AgentRuntime;
    executor: Executor;
    apiProtection: ApiProtection;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
    const app = Fastify({ logger: { level: deps.env.FORJA_LOG_LEVEL } });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    registerErrorHandler(app);
    addSecurityHeaders(app);
    protectApi(app, deps.apiProtection);

    const typedApp = app.withTypeProvider<ZodTypeProvider>();
    await registerApiRouteModules(typedApp, deps);
    await typedApp.register((scope) => registerStaticRoutes(scope, deps));

    return app;
}

async function registerApiRouteModules(app: FastifyInstance, deps: AppDeps): Promise<void> {
    for (const registerRoutes of apiRouteModules) {
        await app.register((scope) => registerRoutes(scope, deps), { prefix: API_PREFIX });
    }
}
