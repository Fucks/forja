import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { RunRecord } from "@/server/runs/run_repository.js";
import type { SerializedRunRecord, SerializedRunView } from "@/shared/run_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildIssueSnapshot, ExecutorTestBed, TEST_PROJECT_ID } from "@/test/executor_test_bed.js";

const ISSUE_1 = buildIssueSnapshot(1);
const ISSUE_2 = buildIssueSnapshot(2);
const ITEMS = [ISSUE_1, ISSUE_2];
const DEV_PROMPT = "Implemente a issue";
const DEV_DURATION_MS = 60_000;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const MAX_ITEMS_PER_RUN = 100;
const MAX_RUNS_PAGE_SIZE = 100;

describe("runs routes", () => {
    let bed: ExecutorTestBed;
    let app: FastifyInstance;
    let flowId: string;

    beforeEach(async () => {
        bed = new ExecutorTestBed(ITEMS);
        app = await buildApp(bed.buildAppDeps());
        flowId = await bed.publishFlow(buildCanonicalFlow());
    });

    afterEach(async () => {
        await app.close();
        bed.close();
    });

    async function postStartRun(payload: object) {
        return app.inject({
            method: "POST",
            url: `/api/projects/${TEST_PROJECT_ID}/runs`,
            payload,
        });
    }

    async function startRun(): Promise<SerializedRunRecord> {
        const response = await postStartRun({ flowId, itemIds: ITEMS.map((item) => item.id) });
        return response.json<SerializedRunRecord>();
    }

    async function startRunWithDevsRunning(): Promise<SerializedRunRecord> {
        bed.runtime.script({ match: { promptIncludes: DEV_PROMPT }, durationMs: DEV_DURATION_MS });
        const run = await startRun();
        await bed.advanceUntil(async () =>
            (await bed.nodeRunsOf(run.id, "dev")).some((nodeRun) => nodeRun.status === "RUNNING"),
        );

        return run;
    }

    async function startFinishedRun(): Promise<RunRecord> {
        const run = await startRun();
        return bed.runUntilFinished(run.id);
    }

    async function listRuns(query: string) {
        return app.inject({ method: "GET", url: `/api/projects/${TEST_PROJECT_ID}/runs?${query}` });
    }

    async function post(url: string, payload?: object) {
        return app.inject({ method: "POST", url, payload });
    }

    describe("POST /api/projects/:projectId/runs", () => {
        it("answers 201 with the run, which then shows in the list", async () => {
            const response = await postStartRun({ flowId, itemIds: [ISSUE_1.id] });
            const listed = await listRuns("");

            expect(response.statusCode).toBe(HTTP_CREATED);
            const started = response.json<SerializedRunRecord>();
            expect(started).toMatchObject({ flowId, flowVersion: 1, itemIds: [ISSUE_1.id] });
            expect(listed.json<SerializedRunRecord[]>().map((run) => run.id)).toEqual([started.id]);
        });

        it("answers 422 asking to publish a flow that has no published version", async () => {
            const draftOnly = await bed.flows.create(TEST_PROJECT_ID, { name: "Rascunho" });

            const response = await postStartRun({ flowId: draftOnly.id });

            expect(response.statusCode).toBe(HTTP_UNPROCESSABLE_ENTITY);
            expect(response.json()).toMatchObject({
                error: { message: "Publique o fluxo antes de executar." },
            });
        });

        it("answers 400 for more items than a run accepts", async () => {
            const tooManyItemIds = Array.from(
                { length: MAX_ITEMS_PER_RUN + 1 },
                (_, index) => `itm_${index}`,
            );

            const response = await postStartRun({ flowId, itemIds: tooManyItemIds });

            expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
        });
    });

    describe("GET /api/projects/:projectId/runs", () => {
        it("pages the runs newest first with limit and before", async () => {
            const first = await startRun();
            bed.clock.advance(1_000);
            const second = await startRun();
            bed.clock.advance(1_000);
            const third = await startRun();

            const firstPage = await listRuns("limit=2");
            const secondPage = await listRuns(`limit=2&before=${second.id}`);

            const idsOf = (runs: SerializedRunRecord[]) => runs.map((run) => run.id);
            expect(idsOf(firstPage.json<SerializedRunRecord[]>())).toEqual([third.id, second.id]);
            expect(idsOf(secondPage.json<SerializedRunRecord[]>())).toEqual([first.id]);
        });

        it("filters the runs by status", async () => {
            const finished = await startFinishedRun();
            await startRunWithDevsRunning();

            const response = await listRuns("status=SUCCEEDED");

            const runs = response.json<SerializedRunRecord[]>();
            expect(runs.map((run) => run.id)).toEqual([finished.id]);
        });

        it("answers 400 for a limit above the page size", async () => {
            const response = await listRuns(`limit=${MAX_RUNS_PAGE_SIZE + 1}`);

            expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
        });
    });

    describe("GET /api/runs/:runId", () => {
        it("answers the RunView with ISO dates, the graph and the map progress", async () => {
            const run = await startRunWithDevsRunning();

            const response = await app.inject({ method: "GET", url: `/api/runs/${run.id}` });

            const view = response.json<SerializedRunView>();
            expect(view.run).toMatchObject({ id: run.id, flowName: "Entrega", status: "RUNNING" });
            expect(view.run.createdAt).toBe(run.createdAt);
            expect(view.graph).toEqual((await bed.flows.getVersion(flowId, 1)).graph);
            expect(view.nodeRuns.length).toBeGreaterThan(0);
            expect(Object.keys(view.groups)).toEqual(["specify", "develop", "review_and_open_pr"]);
            expect(view.lastEventId).toBe(bed.events.lastEventId());
        });

        it("answers 404 for an unknown run", async () => {
            const response = await app.inject({ method: "GET", url: "/api/runs/run_nenhuma" });

            expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        });
    });

    describe("POST /api/runs/:runId/{pause,resume,cancel}", () => {
        it("answers 204 to pause, resume and cancel a running run", async () => {
            const run = await startRunWithDevsRunning();

            const paused = await post(`/api/runs/${run.id}/pause`);
            const resumed = await post(`/api/runs/${run.id}/resume`);
            const canceled = await post(`/api/runs/${run.id}/cancel`);

            expect([paused, resumed, canceled].map((response) => response.statusCode)).toEqual([
                HTTP_NO_CONTENT,
                HTTP_NO_CONTENT,
                HTTP_NO_CONTENT,
            ]);
            expect((await bed.runUntilFinished(run.id)).status).toBe("CANCELED");
        });

        it("answers 409 to pause a finished run", async () => {
            const run = await startFinishedRun();

            const response = await post(`/api/runs/${run.id}/pause`);

            expect(response.statusCode).toBe(HTTP_CONFLICT);
        });
    });

    describe("POST /api/runs/:runId/budget", () => {
        it("answers 204 after raising the budget of a running run", async () => {
            const run = await startRunWithDevsRunning();

            const response = await post(`/api/runs/${run.id}/budget`, { run: { maxTokens: 10 } });

            expect(response.statusCode).toBe(HTTP_NO_CONTENT);
        });

        it("answers 400 for a negative limit", async () => {
            const run = await startRunWithDevsRunning();

            const response = await post(`/api/runs/${run.id}/budget`, { run: { maxCostUsd: -1 } });

            expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
        });
    });

    describe("NodeRun routes", () => {
        it("answers the NodeRun with its artifacts", async () => {
            const run = await startFinishedRun();
            const developer = await bed.findNodeRun(run.id, "dev");

            const response = await app.inject({
                method: "GET",
                url: `/api/node-runs/${developer.id}`,
            });

            expect(response.json()).toMatchObject({
                nodeRun: { id: developer.id, nodeId: "dev", status: "SUCCEEDED" },
                artifacts: [],
            });
        });

        it("answers 204 to cancel a running NodeRun", async () => {
            const run = await startRunWithDevsRunning();
            const runningDev = await bed.findNodeRun(
                run.id,
                "dev",
                (nodeRun) => nodeRun.status === "RUNNING",
            );

            const response = await post(`/api/node-runs/${runningDev.id}/cancel`);

            expect(response.statusCode).toBe(HTTP_NO_CONTENT);
        });

        it("answers 204 to retry a NodeRun of a finished run, reopening it", async () => {
            const run = await startFinishedRun();
            const developer = await bed.findNodeRun(run.id, "dev");

            const response = await post(`/api/node-runs/${developer.id}/retry`);

            expect(response.statusCode).toBe(HTTP_NO_CONTENT);
            expect((await bed.findRun(run.id)).status).toBe("RUNNING");
        });

        it("answers 409 to cancel a NodeRun that already finished", async () => {
            const run = await startFinishedRun();
            const developer = await bed.findNodeRun(run.id, "dev");

            const response = await post(`/api/node-runs/${developer.id}/cancel`);

            expect(response.statusCode).toBe(HTTP_CONFLICT);
        });
    });
});
