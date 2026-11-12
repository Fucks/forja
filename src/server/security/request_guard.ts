import path from "node:path";

import { isSessionToken } from "@/server/security/session_token.js";

export const SESSION_COOKIE_NAME = "forja_session";

const API_PATH_PREFIX = "/api";
const WEBHOOK_PATH_PREFIX = "/api/hooks/";
const LOCAL_HOST_NAMES = ["127.0.0.1", "localhost"];
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const ORIGIN_PROTOCOL = "http://";
const QUERY_SEPARATOR = "?";
const REPEATED_SLASHES = /\/{2,}/g;

const ACCEPTED: GuardResult = { ok: true };
const REMOTE_WEBHOOK_REASON = "Webhooks só são aceitos a partir desta máquina.";
const UNKNOWN_HOST_REASON = "Host não reconhecido.";
const UNKNOWN_ORIGIN_REASON = "Origem não reconhecida.";
const MISSING_SESSION_REASON = "Sessão local ausente ou expirada. Recarregue a Forja.";

export interface GuardedRequest {
    method: string;
    url: string;
    headers: Record<string, string | undefined>;
    cookies: Record<string, string>;
    remoteAddress: string;
}

export interface GuardContext {
    token: string;
    port: number;
}

export type GuardResult = { ok: true } | { ok: false; status: 401 | 403; reason: string };

// A webhook carries the token of its trigger; the routes of the web app hand out the cookie.
export function checkRequest(req: GuardedRequest, ctx: GuardContext): GuardResult {
    const requestPath = readPath(req.url);
    if (requestPath.startsWith(WEBHOOK_PATH_PREFIX)) {
        return checkWebhookSender(req.remoteAddress);
    }

    const senderCheck = checkSenderIsTheApp(req, ctx.port);
    if (!senderCheck.ok || !requestPath.startsWith(API_PATH_PREFIX)) {
        return senderCheck;
    }

    return checkSessionCookie(req.cookies, ctx.token);
}

// Decoded and normalized, so "/api/hooks/%2e%2e/projects" is not taken for a webhook and
// "//api/projects" is not taken for the web app.
function readPath(url: string): string {
    const [rawPath = ""] = url.split(QUERY_SEPARATOR);

    return path.posix.normalize(decodePath(rawPath)).replace(REPEATED_SLASHES, "/");
}

// Fastify answers a malformed path with 400 before any route, so it may stay as it came.
function decodePath(rawPath: string): string {
    try {
        return decodeURIComponent(rawPath);
    } catch {
        return rawPath;
    }
}

function checkWebhookSender(remoteAddress: string): GuardResult {
    if (!LOOPBACK_ADDRESSES.has(remoteAddress)) {
        return { ok: false, status: 403, reason: REMOTE_WEBHOOK_REASON };
    }

    return ACCEPTED;
}

// The Host stops DNS rebinding; the Origin stops other sites open in the browser.
function checkSenderIsTheApp(req: GuardedRequest, port: number): GuardResult {
    const { host, origin } = req.headers;
    if (host === undefined || !listAppHosts(port).includes(host)) {
        return { ok: false, status: 403, reason: UNKNOWN_HOST_REASON };
    }
    if (origin !== undefined && !listAppOrigins(port).includes(origin)) {
        return { ok: false, status: 403, reason: UNKNOWN_ORIGIN_REASON };
    }

    return ACCEPTED;
}

function listAppHosts(port: number): string[] {
    return LOCAL_HOST_NAMES.map((hostName) => `${hostName}:${port}`);
}

function listAppOrigins(port: number): string[] {
    return listAppHosts(port).map((host) => `${ORIGIN_PROTOCOL}${host}`);
}

function checkSessionCookie(cookies: Record<string, string>, token: string): GuardResult {
    const sessionCookie = cookies[SESSION_COOKIE_NAME];
    if (sessionCookie === undefined || !isSessionToken(sessionCookie, token)) {
        return { ok: false, status: 401, reason: MISSING_SESSION_REASON };
    }

    return ACCEPTED;
}
