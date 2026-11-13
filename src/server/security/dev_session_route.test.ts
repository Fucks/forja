import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { SessionProtection } from "@/server/security/api_protection.js";
import { DEV_SESSION_PATH } from "@/server/security/dev_session_route.js";
import { ExecutorTestBed } from "@/test/executor_test_bed.js";

const PORT = 4317;
const SESSION_TOKEN = "token-da-sessao-de-teste";
const APP_HOST = `127.0.0.1:${PORT}`;
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

const DEVELOPMENT_PROTECTION: SessionProtection = {
    kind: "session",
    token: SESSION_TOKEN,
    port: PORT,
    allowsDevServer: true,
};

describe("dev session route", () => {
    let bed: ExecutorTestBed;
    let app: FastifyInstance;

    async function startApp(protection: SessionProtection): Promise<void> {
        app = await buildApp({ ...bed.buildAppDeps(), apiProtection: protection });
    }

    function getDevSession(headers: Record<string, string>) {
        return app.inject({ method: "GET", url: DEV_SESSION_PATH, headers });
    }

    beforeEach(() => {
        bed = new ExecutorTestBed([]);
    });

    afterEach(async () => {
        await app.close();
        bed.close();
    });

    it("hands the session cookie to the Vite dev server in development", async () => {
        await startApp(DEVELOPMENT_PROTECTION);

        const response = await getDevSession({ host: APP_HOST });

        expect(response.statusCode).toBe(HTTP_NO_CONTENT);
        expect(response.headers["set-cookie"]).toBe(
            `forja_session=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Strict`,
        );
    });

    it("opens the API with the cookie it hands out", async () => {
        await startApp(DEVELOPMENT_PROTECTION);
        const devSession = await getDevSession({ host: APP_HOST });
        const [sessionCookie] = String(devSession.headers["set-cookie"]).split(";");

        const response = await app.inject({
            method: "GET",
            url: "/api/health",
            headers: { host: APP_HOST, cookie: sessionCookie },
        });

        expect(response.statusCode).toBe(HTTP_OK);
    });

    it("refuses a request whose Host is not the app", async () => {
        await startApp(DEVELOPMENT_PROTECTION);

        const response = await getDevSession({ host: "evil.example:4317" });

        expect(response.statusCode).toBe(HTTP_FORBIDDEN);
    });

    it("does not exist outside development", async () => {
        await startApp({ ...DEVELOPMENT_PROTECTION, allowsDevServer: false });

        const response = await getDevSession({ host: APP_HOST });

        expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        expect(response.headers["set-cookie"]).toBeUndefined();
    });
});
