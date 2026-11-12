import type { FastifyInstance, FastifyRequest } from "fastify";

import type { Env } from "@/lib/env.js";
import { ForbiddenError, UnauthorizedError } from "@/server/errors.js";
import { checkRequest, type GuardedRequest } from "@/server/security/request_guard.js";
import { parseCookies } from "@/server/security/session_cookie.js";
import { createSessionToken } from "@/server/security/session_token.js";

const WEB_DEV_SERVER_PORT = 5317;
const DEVELOPMENT = "development";
const HTTP_UNAUTHORIZED = 401;

export type SessionProtection = {
    kind: "session";
    token: string;
    port: number;
    // The Vite dev server proxies the API under its own host and port.
    allowsDevServer: boolean;
};

export type ApiProtection = SessionProtection | { kind: "none" };

export function createSessionProtection(env: Env): SessionProtection {
    return {
        kind: "session",
        token: createSessionToken(),
        port: env.FORJA_PORT,
        allowsDevServer: env.NODE_ENV === DEVELOPMENT,
    };
}

export function protectApi(app: FastifyInstance, protection: ApiProtection): void {
    if (protection.kind === "none") {
        return;
    }

    app.addHook("onRequest", (request, _reply, done) => {
        done(findRejection(toGuardedRequest(request), protection));
    });
}

function findRejection(request: GuardedRequest, protection: SessionProtection): Error | undefined {
    const port = choosePortToCheck(request, protection);
    const result = checkRequest(request, { token: protection.token, port });
    if (result.ok) {
        return undefined;
    }
    if (result.status === HTTP_UNAUTHORIZED) {
        return new UnauthorizedError(result.reason);
    }

    return new ForbiddenError(result.reason);
}

function choosePortToCheck(request: GuardedRequest, protection: SessionProtection): number {
    const isSentByDevServer = request.headers.host?.endsWith(`:${WEB_DEV_SERVER_PORT}`) === true;
    if (protection.allowsDevServer && isSentByDevServer) {
        return WEB_DEV_SERVER_PORT;
    }

    return protection.port;
}

function toGuardedRequest(request: FastifyRequest): GuardedRequest {
    const { host, origin, cookie } = request.headers;

    return {
        method: request.method,
        url: request.url,
        headers: { host, origin },
        cookies: parseCookies(cookie),
        remoteAddress: request.ip,
    };
}
