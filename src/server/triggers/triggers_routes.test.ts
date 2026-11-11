import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { ApiErrorBody } from "@/shared/api_types.js";
import type { SerializedRunView } from "@/shared/run_types.js";
import type {
    ListedTrigger,
    Trigger,
    TriggerFire,
    TriggerWithToken,
} from "@/shared/trigger_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildIssueSnapshot, ExecutorTestBed, TEST_PROJECT_ID } from "@/test/executor_test_bed.js";

const ISSUE_1 = buildIssueSnapshot(1);
const DEV_PROMPT = "Implemente a issue";
const DEV_DURATION_MS = 60_000;
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const PROJECT_TRIGGERS_URL = `/api/projects/${TEST_PROJECT_ID}/triggers`;
const PAUSED_URL = "/api/triggers/paused";
const NIGHTLY_CONFIG = { kind: "schedule", cron: "0 2 * * *", timezone: "America/Sao_Paulo" };
const NEXT_NIGHTLY_FIRE = expect.stringMatching(/T05:00:00\.000Z$/) as unknown;

describe("triggers routes", () => {
    let bed: ExecutorTestBed;
    let app: FastifyInstance;
    let flowId: string;

    beforeEach(async () => {
        bed = new ExecutorTestBed([ISSUE_1]);
        app = await buildApp(bed.buildAppDeps());
        flowId = await bed.publishFlow(buildCanonicalFlow());
    });

    afterEach(async () => {
        await app.close();
        bed.close();
    });

    function postTrigger(payload: object) {
        return app.inject({ method: "POST", url: PROJECT_TRIGGERS_URL, payload });
    }

    async function createTrigger(overrides: object = {}): Promise<Trigger> {
        const response = await postTrigger({ flowId, name: "Manual", ...overrides });
        return response.json<Trigger>();
    }

    function fire(triggerId: string, payload: object = {}) {
        return app.inject({ method: "POST", url: `/api/triggers/${triggerId}/fire`, payload });
    }

    async function historyOf(triggerId: string): Promise<TriggerFire[]> {
        const response = await app.inject({
            method: "GET",
            url: `/api/triggers/${triggerId}/history`,
        });
        return response.json<TriggerFire[]>();
    }

    function rotateToken(triggerId: string) {
        return app.inject({ method: "POST", url: `/api/triggers/${triggerId}/rotate-token` });
    }

    function listTriggers(query = "") {
        return app.inject({ method: "GET", url: `${PROJECT_TRIGGERS_URL}${query}` });
    }

    describe("POST /api/projects/:projectId/triggers", () => {
        it("answers 201 with the trigger and its defaults, which then shows in the list", async () => {
            const response = await postTrigger({
                flowId,
                name: "Manual",
                config: { kind: "manual" },
            });
            const listed = await listTriggers();

            expect(response.statusCode).toBe(HTTP_CREATED);
            const trigger = response.json<Trigger>();
            expect(trigger).toMatchObject({
                projectId: TEST_PROJECT_ID,
                flowId,
                name: "Manual",
                enabled: true,
                policy: "skip",
                itemSelection: "source",
                config: { kind: "manual" },
            });
            expect(listed.json()).toEqual([trigger]);
        });

        it("answers 422 for a flow that is not of the project", async () => {
            const response = await postTrigger({
                flowId: "flw_ausente",
                name: "Manual",
                config: { kind: "manual" },
            });

            expect(response.statusCode).toBe(HTTP_UNPROCESSABLE_ENTITY);
        });

        it("answers 422 with a message for an invalid cron", async () => {
            const response = await postTrigger({
                flowId,
                name: "Noturno",
                config: { ...NIGHTLY_CONFIG, cron: "0 25 * * *" },
            });

            expect(response.statusCode).toBe(HTTP_UNPROCESSABLE_ENTITY);
            expect(response.json<ApiErrorBody>().error.message).toContain("0 25 * * *");
        });

        it("answers 400 for a config of an unknown kind", async () => {
            const response = await postTrigger({
                flowId,
                name: "Manual",
                config: { kind: "email" },
            });

            expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
        });
    });

    describe("webhook triggers", () => {
        it("shows the token only in the answer of the creation", async () => {
            const response = await postTrigger({
                flowId,
                name: "Webhook",
                config: { kind: "webhook" },
            });
            const listed = await listTriggers();

            const created = response.json<TriggerWithToken>();
            expect(created.token).toEqual(expect.any(String));
            expect(listed.json<Trigger[]>()).toEqual([
                expect.not.objectContaining({ token: expect.anything() as unknown }),
            ]);
        });

        it("answers the new token on POST /api/triggers/:id/rotate-token", async () => {
            const created = await createTrigger({ name: "Webhook", config: { kind: "webhook" } });

            const response = await rotateToken(created.id);

            expect(response.statusCode).toBe(HTTP_OK);
            const rotated = response.json<TriggerWithToken>();
            expect(rotated).toMatchObject({ id: created.id, token: expect.any(String) as unknown });
            expect(rotated.config).not.toEqual(created.config);
        });

        it("answers 422 when rotating the token of a trigger that is not a webhook", async () => {
            const manual = await createTrigger({ config: { kind: "manual" } });

            const response = await rotateToken(manual.id);

            expect(response.statusCode).toBe(HTTP_UNPROCESSABLE_ENTITY);
        });
    });

    describe("event triggers", () => {
        it("start the flow when the usage limit of the project resets", async () => {
            const trigger = await createTrigger({
                name: "Quota de volta",
                config: { kind: "event", event: "usage.limit_reset" },
            });

            bed.events.publish({ type: "usage.limit_reset", projectId: TEST_PROJECT_ID });
            await settlePendingWork();

            expect(await historyOf(trigger.id)).toEqual([
                expect.objectContaining({ outcome: "started" }),
            ]);
        });

        it("stop listening once the app closes", async () => {
            await createTrigger({
                name: "Quota de volta",
                config: { kind: "event", event: "usage.limit_reset" },
            });
            await app.close();

            bed.events.publish({ type: "usage.limit_reset", projectId: TEST_PROJECT_ID });
            await settlePendingWork();

            expect(bed.events.since(0).map((envelope) => envelope.event.type)).not.toContain(
                "trigger.fired",
            );
        });
    });

    describe("GET /api/projects/:projectId/triggers", () => {
        it("keeps only the triggers of the kind in the query", async () => {
            await createTrigger({ config: { kind: "manual" } });
            const nightly = await createTrigger({ name: "Noturno", config: NIGHTLY_CONFIG });

            const response = await listTriggers("?kind=schedule");

            expect(response.json()).toEqual([
                { ...nightly, cronDescription: "todo dia às 02:00", nextFireAt: NEXT_NIGHTLY_FIRE },
            ]);
        });

        it("shows the readable cron and the next fire of a schedule trigger", async () => {
            const nightly = await createTrigger({ name: "Noturno", config: NIGHTLY_CONFIG });

            const [listed] = (await listTriggers()).json<ListedTrigger[]>();

            expect(listed).toEqual({
                ...nightly,
                cronDescription: "todo dia às 02:00",
                nextFireAt: NEXT_NIGHTLY_FIRE,
            });
            expect(Date.parse(listed?.nextFireAt ?? "")).toBeGreaterThan(Date.now());
        });

        it("shows no next fire for a disabled schedule trigger", async () => {
            const nightly = await createTrigger({ enabled: false, config: NIGHTLY_CONFIG });

            const response = await listTriggers();

            expect(response.json()).toEqual([{ ...nightly, cronDescription: "todo dia às 02:00" }]);
        });

        it("answers 404 for an unknown project", async () => {
            const response = await app.inject({
                method: "GET",
                url: "/api/projects/prj_ausente/triggers",
            });

            expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        });
    });

    describe("PATCH /api/triggers/:id", () => {
        it("answers the trigger with the patch applied", async () => {
            const trigger = await createTrigger({ config: { kind: "manual" } });

            const response = await app.inject({
                method: "PATCH",
                url: `/api/triggers/${trigger.id}`,
                payload: { enabled: false, policy: "queue" },
            });

            expect(response.json()).toEqual({ ...trigger, enabled: false, policy: "queue" });
        });

        it("answers 422 for an invalid cron", async () => {
            const trigger = await createTrigger({ config: NIGHTLY_CONFIG });

            const response = await app.inject({
                method: "PATCH",
                url: `/api/triggers/${trigger.id}`,
                payload: { config: { ...NIGHTLY_CONFIG, cron: "toda noite" } },
            });

            expect(response.statusCode).toBe(HTTP_UNPROCESSABLE_ENTITY);
        });

        it("answers 404 for an unknown trigger", async () => {
            const response = await app.inject({
                method: "PATCH",
                url: "/api/triggers/trg_ausente",
                payload: { enabled: false },
            });

            expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        });
    });

    describe("DELETE /api/triggers/:id", () => {
        it("answers 204 and removes the trigger", async () => {
            const trigger = await createTrigger({ config: { kind: "manual" } });

            const response = await app.inject({
                method: "DELETE",
                url: `/api/triggers/${trigger.id}`,
            });

            expect(response.statusCode).toBe(HTTP_NO_CONTENT);
            expect((await listTriggers()).json()).toEqual([]);
        });
    });

    describe("POST /api/triggers/:id/fire", () => {
        it("answers 201 with the fire and starts a run of the flow with the trigger", async () => {
            const trigger = await createTrigger({
                config: { kind: "manual" },
                itemSelection: "event_items",
            });

            const response = await fire(trigger.id, { itemIds: [ISSUE_1.id] });

            expect(response.statusCode).toBe(HTTP_CREATED);
            const fired = response.json<TriggerFire>();
            expect(fired).toMatchObject({ triggerId: trigger.id, outcome: "started" });
            const run = await app.inject({ method: "GET", url: `/api/runs/${fired.runId}` });
            expect(run.json<SerializedRunView>().run).toMatchObject({
                flowId,
                triggerId: trigger.id,
                itemIds: [ISSUE_1.id],
            });
            expect(await historyOf(trigger.id)).toEqual([fired]);
        });

        it("starts a queued fire once the active run of the flow finishes", async () => {
            bed.runtime.script({
                match: { promptIncludes: DEV_PROMPT },
                durationMs: DEV_DURATION_MS,
            });
            const trigger = await createTrigger({
                config: { kind: "manual" },
                policy: "queue",
                itemSelection: "event_items",
            });
            const first = (await fire(trigger.id, { itemIds: [ISSUE_1.id] })).json<TriggerFire>();
            const queued = (await fire(trigger.id, { itemIds: [ISSUE_1.id] })).json<TriggerFire>();
            const queuedOutcome = queued.outcome;

            await bed.runUntilFinished(runIdOf(first));
            await bed.advanceUntil(async () =>
                (await historyOf(trigger.id)).every((fired) => fired.outcome === "started"),
            );

            expect(queuedOutcome).toBe("queued");
        });

        it("answers 404 for an unknown trigger", async () => {
            const response = await fire("trg_ausente");

            expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        });
    });

    describe("GET /api/triggers/:id/history", () => {
        it("answers 400 for a limit that is not positive", async () => {
            const trigger = await createTrigger({ config: { kind: "manual" } });

            const response = await app.inject({
                method: "GET",
                url: `/api/triggers/${trigger.id}/history?limit=0`,
            });

            expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
        });
    });

    describe("GET and PUT /api/triggers/paused", () => {
        it("answers whether all triggers are paused, and pausing makes the others skip", async () => {
            const nightly = await createTrigger({ name: "Noturno", config: NIGHTLY_CONFIG });
            const before = await app.inject({ method: "GET", url: PAUSED_URL });

            const paused = await app.inject({
                method: "PUT",
                url: PAUSED_URL,
                payload: { paused: true },
            });
            const fired = await fire(nightly.id);

            expect(before.json()).toEqual({ paused: false });
            expect(paused.statusCode).toBe(HTTP_OK);
            expect(paused.json()).toEqual({ paused: true });
            expect(fired.json()).toMatchObject({ outcome: "skipped" });
        });
    });
});

function runIdOf(fire: TriggerFire): string {
    if (!fire.runId) {
        throw new Error(`Fire ${fire.id} started no run`);
    }

    return fire.runId;
}

// Lets the fires started by the event listener run before the test looks at the result.
function settlePendingWork(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}
