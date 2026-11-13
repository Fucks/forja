import type { FastifyInstance } from "fastify";

import type { AgentEvent } from "@/integrations/agent_runtime/agent_runtime.js";
import { buildApp, type AppDeps } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import type { CleanupReport } from "@/server/maintenance/cleanup_service.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import type { ApiErrorBody } from "@/shared/api_types.js";
import { storedLogEventSchema, type LogPage } from "@/shared/log_types.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildRunRecord } from "@/test/factories/run_record_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const RUN_ID = "run_entrega";
const NODE_RUN_ID = "nrn_dev";
const LOGS_URL = `/api/node-runs/${NODE_RUN_ID}/logs`;
const RAW_LOGS_URL = `${LOGS_URL}/raw`;
const MISSING_NODE_RUN_ID = "nrn_inexistente";
const EVENT_AT = new Date("2026-11-09T12:00:00Z");
const LOGGED_TEXTS = ["linha 1", "linha 2", "linha 3", "linha 4", "linha 5"];
const MAX_LOG_PAGE_SIZE = 2_000;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;
const CLEANUP_URL = "/api/maintenance/cleanup";
const LONG_AGO = new Date("2020-01-01T00:00:00Z");

function textEvent(text: string): AgentEvent {
    return { kind: "text", text, at: EVENT_AT, iteration: 1 };
}

describe("logs routes", () => {
    let database: DatabaseHandle;
    let deps: AppDeps;
    let app: FastifyInstance;

    beforeEach(async () => {
        database = createTestDb();
        deps = createTestAppDeps(database.db);
        await saveNodeRun();
        for (const text of LOGGED_TEXTS) {
            await deps.logs.append({ runId: RUN_ID, nodeRunId: NODE_RUN_ID }, textEvent(text));
        }
        app = await buildApp(deps);
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    async function saveNodeRun(): Promise<void> {
        const runs = new SqliteRunRepository(database.db, new FakeClock());
        await runs.createRun(
            buildRunRecord({ id: RUN_ID, status: "SUCCEEDED", finishedAt: LONG_AGO }),
        );
        await runs.saveTransition({
            nodeRuns: [buildNodeRunState({ id: NODE_RUN_ID, runId: RUN_ID })],
        });
    }

    async function get(url: string) {
        return app.inject({ method: "GET", url });
    }

    async function cleanUp() {
        return app.inject({ method: "POST", url: CLEANUP_URL });
    }

    describe("GET /api/node-runs/:id/logs", () => {
        it("answers the page of events from fromSeq up to the limit", async () => {
            const response = await get(`${LOGS_URL}?fromSeq=2&limit=2`);

            const page = response.json<LogPage>();
            expect(response.statusCode).toBe(HTTP_OK);
            expect(page.events.map((event) => event.text)).toEqual(["linha 2", "linha 3"]);
            expect(page.nextSeq).toBe(4);
            expect(page.total).toBe(LOGGED_TEXTS.length);
        });

        it("reads from the first event when no page is given", async () => {
            const response = await get(LOGS_URL);

            const page = response.json<LogPage>();
            expect(page.events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5]);
            expect(page.nextSeq).toBe(LOGGED_TEXTS.length + 1);
        });

        it("answers 400 when the limit is above 2 000", async () => {
            const response = await get(`${LOGS_URL}?limit=${MAX_LOG_PAGE_SIZE + 1}`);

            expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
        });

        it("answers 404 for a NodeRun that does not exist", async () => {
            const response = await get(`/api/node-runs/${MISSING_NODE_RUN_ID}/logs`);

            expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        });
    });

    describe("GET /api/node-runs/:id/logs/raw", () => {
        it("downloads the whole NDJSON as a text file", async () => {
            const response = await get(RAW_LOGS_URL);

            const downloadedEvents = response.body
                .trimEnd()
                .split("\n")
                .map((line) => storedLogEventSchema.parse(JSON.parse(line)));
            expect(response.statusCode).toBe(HTTP_OK);
            expect(response.headers["content-type"]).toMatch(/^text\/plain/);
            expect(response.headers["content-disposition"]).toBe(
                `attachment; filename="${NODE_RUN_ID}.ndjson"`,
            );
            expect(downloadedEvents.map((event) => event.text)).toEqual(LOGGED_TEXTS);
        });

        it("answers 404 for a NodeRun that does not exist", async () => {
            const response = await get(`/api/node-runs/${MISSING_NODE_RUN_ID}/logs/raw`);

            expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        });
    });

    describe("POST /api/maintenance/cleanup", () => {
        it("cleans up on demand and reports what it removed", async () => {
            const loggedBytes = (await deps.logs.stats(NODE_RUN_ID)).bytes;

            const response = await cleanUp();

            expect(response.statusCode).toBe(HTTP_OK);
            expect(response.json<CleanupReport>()).toEqual({
                deletedRuns: 1,
                freedBytes: loggedBytes,
                prunedWorktrees: 0,
            });
        });
    });

    describe("logs removed by the retention", () => {
        it.each([LOGS_URL, RAW_LOGS_URL])("answers 410 logs_expired at %s", async (url) => {
            await cleanUp();

            const response = await get(url);

            expect(response.statusCode).toBe(HTTP_GONE);
            expect(response.json<ApiErrorBody>().error.code).toBe("logs_expired");
        });
    });
});
