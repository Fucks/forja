import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { RouteModule } from "@/server/route_modules.js";
import type { ApiProtection } from "@/server/security/api_protection.js";
import { formatSessionCookie } from "@/server/security/session_cookie.js";

const WEB_APP_ENTRY_FILE = "index.html";
const API_PATH_PREFIX = "/api";
const NOT_FOUND_STATUS = 404;

// Only the bundle ships the SPA (dist/web next to dist/cli.js); from the sources, Vite serves it.
const BUNDLED_WEB_DIR = fileURLToPath(new URL("web", import.meta.url));

export const registerStaticRoutes: RouteModule = (app, deps) =>
    serveWebApp(app, BUNDLED_WEB_DIR, deps.apiProtection);

export async function serveWebApp(
    app: FastifyInstance,
    webDir: string,
    apiProtection: ApiProtection,
): Promise<void> {
    if (!existsSync(webDir)) {
        return;
    }

    await app.register(fastifyStatic, {
        root: webDir,
        setHeaders: (reply, filePath) => handOutSessionCookie(reply, filePath, apiProtection),
    });
    app.setNotFoundHandler(answerUnknownRoute);
}

// The SPA loads from index.html, so the cookie arrives before its first API request.
function handOutSessionCookie(
    reply: FastifyReply,
    filePath: string,
    apiProtection: ApiProtection,
): void {
    const isWebAppEntry = path.basename(filePath) === WEB_APP_ENTRY_FILE;
    if (apiProtection.kind === "session" && isWebAppEntry) {
        reply.header("set-cookie", formatSessionCookie(apiProtection.token));
    }
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
