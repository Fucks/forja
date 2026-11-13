import type { FastifyInstance } from "fastify";

import type { ApiProtection } from "@/server/security/api_protection.js";
import { formatSessionCookie } from "@/server/security/session_cookie.js";

// Outside /api, so the guard checks only Host and Origin here, as it does for index.html.
export const DEV_SESSION_PATH = "/session";

const HTTP_NO_CONTENT = 204;

// In development Vite serves index.html, so its dev server asks here for the cookie to hand out.
export function serveSessionToDevServer(app: FastifyInstance, protection: ApiProtection): void {
    if (protection.kind === "none" || !protection.allowsDevServer) {
        return;
    }

    const sessionCookie = formatSessionCookie(protection.token);
    app.get(DEV_SESSION_PATH, (_request, reply) =>
        reply.header("set-cookie", sessionCookie).code(HTTP_NO_CONTENT).send(),
    );
}
