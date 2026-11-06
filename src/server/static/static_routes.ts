import { existsSync } from "node:fs";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { runtimeAssetPath } from "@/lib/paths.js";
import type { RouteModule } from "@/server/route_modules.js";

const WEB_APP_ENTRY_FILE = "index.html";
const API_PATH_PREFIX = "/api";
const NOT_FOUND_STATUS = 404;

export const registerStaticRoutes: RouteModule = (app) => serveWebApp(app, runtimeAssetPath("web"));

export async function serveWebApp(app: FastifyInstance, webDir: string): Promise<void> {
    if (!existsSync(webDir)) {
        return;
    }

    await app.register(fastifyStatic, { root: webDir });
    app.setNotFoundHandler(answerUnknownRoute);
}

function answerUnknownRoute(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    if (isWebAppNavigation(request)) {
        return reply.sendFile(WEB_APP_ENTRY_FILE);
    }

    return reply.code(NOT_FOUND_STATUS).send({
        statusCode: NOT_FOUND_STATUS,
        error: "Not Found",
        message: `Rota ${request.method} ${request.url} não encontrada.`,
    });
}

function isWebAppNavigation(request: FastifyRequest): boolean {
    return request.method === "GET" && !request.url.startsWith(API_PATH_PREFIX);
}
