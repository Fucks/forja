import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { SerializedRunView } from "@/shared/run_types.js";
import type { Trigger, TriggerFire, TriggerWithToken } from "@/shared/trigger_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildIssueSnapshot, ExecutorTestBed, TEST_PROJECT_ID } from "@/test/executor_test_bed.js";

const ISSUE_1 = buildIssueSnapshot(1);
const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const PROJECT_TRIGGERS_URL = `/api/projects/${TEST_PROJECT_ID}/triggers`;
const TOKEN_HEADER = "X-Forja-Token";
const LAN_ADDRESS = "192.168.0.10";
const IPV6_LOOPBACK = "::1";

describe("webhook routes", () => {
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

    async function createWebhookTrigger(): Promise<TriggerWithToken> {
        const response = await app.inject({
            method: "POST",
            url: PROJECT_TRIGGERS_URL,
            payload: {
                flowId,
                name: "Webhook",
                itemSelection: "event_items",
                config: { kind: "webhook" },
            },
        });
        return response.json<TriggerWithToken>();
    }

    function callWebhook(
        triggerId: string,
        options: { token?: string; payload?: object; remoteAddress?: string } = {},
    ) {
        const headers = options.token === undefined ? {} : { [TOKEN_HEADER]: options.token };

        return app.inject({
            method: "POST",
            url: `/api/hooks/${triggerId}`,
            headers,
            payload: options.payload,
            remoteAddress: options.remoteAddress,
        });
    }

    describe("POST /api/hooks/:triggerId", () => {
        it("answers 202 with the fire and starts a run of the flow", async () => {
            const trigger = await createWebhookTrigger();

            const response = await callWebhook(trigger.id, { token: trigger.token });

            expect(response.statusCode).toBe(HTTP_ACCEPTED);
            expect(response.json<TriggerFire>()).toMatchObject({
                triggerId: trigger.id,
                outcome: "started",
            });
        });

        it("starts the run with the items of the body", async () => {
            const trigger = await createWebhookTrigger();

            const response = await callWebhook(trigger.id, {
                token: trigger.token,
                payload: { itemIds: [ISSUE_1.id] },
            });

            const { runId } = response.json<TriggerFire>();
            const run = await app.inject({ method: "GET", url: `/api/runs/${runId}` });
            expect(run.json<SerializedRunView>().run).toMatchObject({
                triggerId: trigger.id,
                itemIds: [ISSUE_1.id],
            });
        });

        it("answers 400 for a body with items that are not ids", async () => {
            const trigger = await createWebhookTrigger();

            const response = await callWebhook(trigger.id, {
                token: trigger.token,
                payload: { itemIds: [1] },
            });

            expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
        });

        it("accepts a call from the IPv6 loopback", async () => {
            const trigger = await createWebhookTrigger();

            const response = await callWebhook(trigger.id, {
                token: trigger.token,
                remoteAddress: IPV6_LOOPBACK,
            });

            expect(response.statusCode).toBe(HTTP_ACCEPTED);
        });

        it("answers 401 without a token", async () => {
            const trigger = await createWebhookTrigger();

            const response = await callWebhook(trigger.id);

            expect(response.statusCode).toBe(HTTP_UNAUTHORIZED);
        });

        it("answers 401 for a wrong token and starts nothing", async () => {
            const trigger = await createWebhookTrigger();
            const other = await createWebhookTrigger();

            const response = await callWebhook(trigger.id, { token: other.token });

            expect(response.statusCode).toBe(HTTP_UNAUTHORIZED);
            expect(bed.events.since(0).map((envelope) => envelope.event.type)).not.toContain(
                "trigger.fired",
            );
        });

        it("answers 401 for a trigger that is not a webhook", async () => {
            const webhook = await createWebhookTrigger();
            const manual = await app.inject({
                method: "POST",
                url: PROJECT_TRIGGERS_URL,
                payload: { flowId, name: "Manual", config: { kind: "manual" } },
            });

            const response = await callWebhook(manual.json<Trigger>().id, {
                token: webhook.token,
            });

            expect(response.statusCode).toBe(HTTP_UNAUTHORIZED);
        });

        it("answers 403 from outside localhost, even with the right token", async () => {
            const trigger = await createWebhookTrigger();

            const response = await callWebhook(trigger.id, {
                token: trigger.token,
                remoteAddress: LAN_ADDRESS,
            });

            expect(response.statusCode).toBe(HTTP_FORBIDDEN);
        });

        it("answers 404 for a trigger that does not exist", async () => {
            const response = await callWebhook("trg_ausente", { token: "qualquer" });

            expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        });
    });
});
