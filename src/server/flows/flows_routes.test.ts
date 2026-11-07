import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowDraft, FlowSummary, FlowVersion } from "@/shared/flow_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const PROJECT_ID = "prj_forja";
const GRAPH_WITHOUT_TRIGGER: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };

describe("flows routes", () => {
    let database: DatabaseHandle;
    let app: FastifyInstance;

    beforeEach(async () => {
        database = createTestDb();
        new ProjectRepository(database.db).insert(buildProject({ id: PROJECT_ID }));
        app = await buildApp(createTestAppDeps(database.db));
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    async function createFlow(name = "Entrega"): Promise<FlowSummary> {
        const response = await app.inject({
            method: "POST",
            url: `/api/projects/${PROJECT_ID}/flows`,
            payload: { name },
        });
        return response.json<FlowSummary>();
    }

    async function saveDraft(flowId: string, graph: FlowGraph, expectedRevision: number) {
        return app.inject({
            method: "PUT",
            url: `/api/flows/${flowId}/draft`,
            payload: { graph, expectedRevision },
        });
    }

    async function publish(flowId: string, payload?: { note: string }) {
        return app.inject({ method: "POST", url: `/api/flows/${flowId}/publish`, payload });
    }

    describe("POST /api/projects/:projectId/flows", () => {
        it("answers 201 with the new flow at draft revision 1", async () => {
            const response = await app.inject({
                method: "POST",
                url: `/api/projects/${PROJECT_ID}/flows`,
                payload: { name: "Entrega" },
            });

            expect(response.statusCode).toBe(201);
            expect(response.json()).toMatchObject({
                projectId: PROJECT_ID,
                name: "Entrega",
                draftRevision: 1,
            });
        });

        it("answers 404 for an unknown project", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/projects/prj_nenhum/flows",
                payload: { name: "Entrega" },
            });

            expect(response.statusCode).toBe(404);
        });

        it("answers 400 when the name is blank", async () => {
            const response = await app.inject({
                method: "POST",
                url: `/api/projects/${PROJECT_ID}/flows`,
                payload: { name: "  " },
            });

            expect(response.statusCode).toBe(400);
            expect(response.json()).toMatchObject({ error: { code: "validation_error" } });
        });
    });

    describe("GET /api/projects/:projectId/flows", () => {
        it("answers the active flows, and the archived ones when asked", async () => {
            const archived = await createFlow("Antigo");
            const active = await createFlow("Atual");
            await app.inject({ method: "POST", url: `/api/flows/${archived.id}/archive` });

            const visible = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/flows`,
            });
            const all = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/flows?includeArchived=true`,
            });

            expect(visible.statusCode).toBe(200);
            expect(visible.json()).toEqual([active]);
            expect(all.json<FlowSummary[]>().map((flow) => flow.name)).toEqual(["Antigo", "Atual"]);
        });
    });

    describe("PATCH /api/flows/:flowId", () => {
        it("answers the renamed flow", async () => {
            const flow = await createFlow();

            const response = await app.inject({
                method: "PATCH",
                url: `/api/flows/${flow.id}`,
                payload: { name: "Entrega contínua" },
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({ ...flow, name: "Entrega contínua" });
        });

        it("answers 404 for an unknown flow", async () => {
            const response = await app.inject({
                method: "PATCH",
                url: "/api/flows/flw_nenhum",
                payload: { name: "Nada" },
            });

            expect(response.statusCode).toBe(404);
            expect(response.json()).toMatchObject({ error: { code: "not_found" } });
        });
    });

    describe("POST /api/flows/:flowId/archive", () => {
        it("answers 204", async () => {
            const flow = await createFlow();

            const response = await app.inject({
                method: "POST",
                url: `/api/flows/${flow.id}/archive`,
            });

            expect(response.statusCode).toBe(204);
        });
    });

    describe("POST /api/flows/:flowId/default", () => {
        it("answers 204 and makes it the only default flow of the project", async () => {
            const first = await createFlow("Primeiro");
            const second = await createFlow("Segundo");
            await app.inject({ method: "POST", url: `/api/flows/${first.id}/default` });

            const response = await app.inject({
                method: "POST",
                url: `/api/flows/${second.id}/default`,
            });

            expect(response.statusCode).toBe(204);
            const list = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/flows`,
            });
            expect(list.json<FlowSummary[]>().map((flow) => flow.isDefault)).toEqual([false, true]);
        });
    });

    describe("GET /api/flows/:flowId/draft", () => {
        it("answers the draft", async () => {
            const flow = await createFlow();

            const response = await app.inject({
                method: "GET",
                url: `/api/flows/${flow.id}/draft`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ flowId: flow.id, revision: 1 });
        });
    });

    describe("PUT /api/flows/:flowId/draft", () => {
        it("answers the saved draft at the next revision", async () => {
            const flow = await createFlow();

            const response = await saveDraft(flow.id, buildCanonicalFlow(), 1);

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ graph: buildCanonicalFlow(), revision: 2 });
        });

        it("answers 409 when the expected revision is stale", async () => {
            const flow = await createFlow();
            await saveDraft(flow.id, buildCanonicalFlow(), 1);

            const response = await saveDraft(flow.id, GRAPH_WITHOUT_TRIGGER, 1);

            expect(response.statusCode).toBe(409);
            expect(response.json()).toMatchObject({ error: { code: "conflict" } });
        });

        it("answers 400 when the graph has an invalid shape", async () => {
            const flow = await createFlow();

            const response = await app.inject({
                method: "PUT",
                url: `/api/flows/${flow.id}/draft`,
                payload: { graph: { nodes: "nenhum" }, expectedRevision: 1 },
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe("POST /api/flows/:flowId/publish", () => {
        it("answers 201 with the new version", async () => {
            const flow = await createFlow();

            const response = await publish(flow.id, { note: "Primeira" });

            expect(response.statusCode).toBe(201);
            expect(response.json()).toMatchObject({
                flowId: flow.id,
                version: 1,
                note: "Primeira",
            });
        });

        it("publishes without a body", async () => {
            const flow = await createFlow();

            const response = await publish(flow.id);

            expect(response.statusCode).toBe(201);
        });

        it("answers 422 with the validation issues when the graph has errors", async () => {
            const flow = await createFlow();
            await saveDraft(flow.id, GRAPH_WITHOUT_TRIGGER, 1);

            const response = await publish(flow.id);

            expect(response.statusCode).toBe(422);
            expect(response.json()).toEqual({
                error: {
                    code: "invalid",
                    message: "O fluxo tem erros e não pode ser publicado.",
                    details: [
                        {
                            level: "error",
                            code: "no_trigger",
                            message: "O fluxo precisa de um nó de gatilho.",
                            target: { kind: "flow" },
                        },
                    ],
                },
            });
        });
    });

    describe("versions", () => {
        it("lists the versions without their graphs", async () => {
            const flow = await createFlow();
            await publish(flow.id);

            const response = await app.inject({
                method: "GET",
                url: `/api/flows/${flow.id}/versions`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual([
                { flowId: flow.id, version: 1, publishedAt: expect.any(String) as unknown },
            ]);
        });

        it("answers a published version unchanged by later draft edits", async () => {
            const flow = await createFlow();
            const published = (await publish(flow.id)).json<FlowVersion>();
            await saveDraft(flow.id, buildCanonicalFlow(), 1);

            const response = await app.inject({
                method: "GET",
                url: `/api/flows/${flow.id}/versions/1`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual(published);
        });

        it("answers 404 for an unknown version", async () => {
            const flow = await createFlow();

            const response = await app.inject({
                method: "GET",
                url: `/api/flows/${flow.id}/versions/7`,
            });

            expect(response.statusCode).toBe(404);
        });

        it("answers 400 for a version that is not a positive integer", async () => {
            const flow = await createFlow();

            const response = await app.inject({
                method: "GET",
                url: `/api/flows/${flow.id}/versions/primeira`,
            });

            expect(response.statusCode).toBe(400);
        });

        it("restores a version into the draft", async () => {
            const flow = await createFlow();
            const published = (await publish(flow.id)).json<FlowVersion>();
            await saveDraft(flow.id, buildCanonicalFlow(), 1);

            const response = await app.inject({
                method: "POST",
                url: `/api/flows/${flow.id}/versions/1/restore`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json<FlowDraft>()).toMatchObject({
                graph: published.graph,
                revision: 3,
            });
        });
    });
});
