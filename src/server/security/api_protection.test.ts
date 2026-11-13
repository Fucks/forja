import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { ApiProtection } from "@/server/security/api_protection.js";
import type { TriggerWithToken } from "@/shared/trigger_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { ExecutorTestBed, TEST_PROJECT_ID } from "@/test/executor_test_bed.js";

const PORT = 4317;
const WEB_DEV_SERVER_PORT = 5317;
const SESSION_TOKEN = "token-da-sessao-de-teste";
const APP_HOST = `127.0.0.1:${PORT}`;
const SESSION_COOKIE = `forja_session=${SESSION_TOKEN}`;
const HTTP_OK = 200;
const HTTP_ACCEPTED = 202;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

const SESSION_PROTECTION: ApiProtection = {
    kind: "session",
    token: SESSION_TOKEN,
    port: PORT,
    allowsDevServer: false,
};

describe("API protection", () => {
    let bed: ExecutorTestBed;
    let app: FastifyInstance;

    async function startApp(protection: ApiProtection): Promise<void> {
        app = await buildApp({ ...bed.buildAppDeps(), apiProtection: protection });
    }

    function getHealth(headers: Record<string, string>) {
        return app.inject({ method: "GET", url: "/api/health", headers });
    }

    beforeEach(() => {
        bed = new ExecutorTestBed([]);
    });

    afterEach(async () => {
        await app.close();
        bed.close();
    });

    describe("with the local session", () => {
        beforeEach(() => startApp(SESSION_PROTECTION));

        it("answers the API with the session cookie", async () => {
            const response = await getHealth({ host: APP_HOST, cookie: SESSION_COOKIE });

            expect(response.statusCode).toBe(HTTP_OK);
        });

        it("answers 401 in the API error format without the session cookie", async () => {
            const response = await getHealth({ host: APP_HOST });

            expect(response.statusCode).toBe(HTTP_UNAUTHORIZED);
            expect(response.json()).toEqual({
                error: {
                    code: "unauthorized",
                    message: "Sessão local ausente ou expirada. Recarregue a Forja.",
                },
            });
        });

        it("finds the session cookie among other cookies", async () => {
            const cookie = `tema=escuro; ${SESSION_COOKIE}; outro=1`;

            const response = await getHealth({ host: APP_HOST, cookie });

            expect(response.statusCode).toBe(HTTP_OK);
        });

        it("answers 403 to a request under another host", async () => {
            const response = await getHealth({ host: "evil.example", cookie: SESSION_COOKIE });

            expect(response.statusCode).toBe(HTTP_FORBIDDEN);
            expect(response.json()).toMatchObject({ error: { code: "forbidden" } });
        });

        it("answers 403 to a request another site sends", async () => {
            const response = await getHealth({
                host: APP_HOST,
                cookie: SESSION_COOKIE,
                origin: "https://evil.example",
            });

            expect(response.statusCode).toBe(HTTP_FORBIDDEN);
        });

        it("answers 403 to the Vite dev server outside development", async () => {
            const response = await getHealth({
                host: `localhost:${WEB_DEV_SERVER_PORT}`,
                cookie: SESSION_COOKIE,
            });

            expect(response.statusCode).toBe(HTTP_FORBIDDEN);
        });

        it("fires a webhook with only the token of its trigger", async () => {
            const flowId = await bed.publishFlow(buildCanonicalFlow());
            const created = await app.inject({
                method: "POST",
                url: `/api/projects/${TEST_PROJECT_ID}/triggers`,
                headers: { host: APP_HOST, cookie: SESSION_COOKIE },
                payload: {
                    flowId,
                    name: "Webhook",
                    itemSelection: "event_items",
                    config: { kind: "webhook" },
                },
            });
            const trigger = created.json<TriggerWithToken>();

            const response = await app.inject({
                method: "POST",
                url: `/api/hooks/${trigger.id}`,
                headers: { "x-forja-token": trigger.token },
            });

            expect(response.statusCode).toBe(HTTP_ACCEPTED);
        });

        it("answers 403 to a webhook from another machine", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/hooks/trg_qualquer",
                remoteAddress: "192.168.0.10",
            });

            expect(response.statusCode).toBe(HTTP_FORBIDDEN);
        });
    });

    describe("in development", () => {
        beforeEach(() => startApp({ ...SESSION_PROTECTION, allowsDevServer: true }));

        it("answers the requests the Vite dev server proxies", async () => {
            const devServerHost = `localhost:${WEB_DEV_SERVER_PORT}`;

            const response = await getHealth({
                host: devServerHost,
                origin: `http://${devServerHost}`,
                cookie: SESSION_COOKIE,
            });

            expect(response.statusCode).toBe(HTTP_OK);
        });

        it("still answers the requests sent to the server itself", async () => {
            const response = await getHealth({ host: APP_HOST, cookie: SESSION_COOKIE });

            expect(response.statusCode).toBe(HTTP_OK);
        });

        it("still asks the dev server for the session cookie", async () => {
            const response = await getHealth({ host: `localhost:${WEB_DEV_SERVER_PORT}` });

            expect(response.statusCode).toBe(HTTP_UNAUTHORIZED);
        });
    });

    describe("without protection", () => {
        beforeEach(() => startApp({ kind: "none" }));

        it("answers the API without a session", async () => {
            const response = await app.inject({ method: "GET", url: "/api/health" });

            expect(response.statusCode).toBe(HTTP_OK);
        });
    });
});
