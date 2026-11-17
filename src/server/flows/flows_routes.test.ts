import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { flowToYaml, yamlToFlow } from "@/server/flows/flow_yaml.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowDraft, FlowSummary, FlowVersion } from "@/shared/flow_types.js";
import { normalizeFlowGraph } from "@/shared/normalize_flow_graph.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { updateNode } from "@/test/factories/flow_graph_variations.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const PROJECT_ID = "prj_forja";
const EXPORTED_AT = "2026-11-08T12:00:00.000Z";
const GRAPH_WITHOUT_TRIGGER: FlowGraph = { schemaVersion: 2, nodes: [], edges: [], groups: [] };

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

        it("rejects an agent that uses a credential that does not exist", async () => {
            const flow = await createFlow();
            const graph = updateNode(buildCanonicalFlow(), "dev", (node) =>
                node.type === "agent"
                    ? { ...node, config: { ...node.config, credentialId: "cred_inexistente" } }
                    : node,
            );
            await saveDraft(flow.id, graph, 1);

            const response = await publish(flow.id);

            expect(response.statusCode).toBe(422);
            expect(response.json()).toMatchObject({
                error: { details: [{ code: "unknown_credential" }] },
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

    describe("GET /api/flows/:flowId/export", () => {
        async function exportFlow(flowId: string, version: string) {
            return app.inject({
                method: "GET",
                url: `/api/flows/${flowId}/export?version=${version}`,
            });
        }

        it("answers the draft as a YAML attachment named after the flow", async () => {
            const flow = await createFlow("Entrega Contínua");
            await saveDraft(flow.id, buildCanonicalFlow(), 1);

            const response = await exportFlow(flow.id, "draft");

            expect(response.statusCode).toBe(200);
            expect(response.headers["content-type"]).toContain("application/yaml");
            expect(response.headers["content-disposition"]).toBe(
                'attachment; filename="entrega_continua.forja.yaml"',
            );
            expect(yamlToFlow(response.body)).toMatchObject({
                forja: 1,
                name: "Entrega Contínua",
                graph: normalizeFlowGraph(buildCanonicalFlow()),
            });
        });

        it("answers a published version unchanged by later draft edits", async () => {
            const flow = await createFlow();
            const published = (await publish(flow.id)).json<FlowVersion>();
            await saveDraft(flow.id, buildCanonicalFlow(), 1);

            const response = await exportFlow(flow.id, "1");

            expect(response.statusCode).toBe(200);
            expect(yamlToFlow(response.body).graph).toEqual(normalizeFlowGraph(published.graph));
        });

        it("answers 404 for an unknown version", async () => {
            const flow = await createFlow();

            const response = await exportFlow(flow.id, "7");

            expect(response.statusCode).toBe(404);
        });

        it("answers 404 for an unknown flow", async () => {
            const response = await exportFlow("flw_nenhum", "draft");

            expect(response.statusCode).toBe(404);
        });

        it("answers 400 for a version that is neither a number nor draft", async () => {
            const flow = await createFlow();

            const response = await exportFlow(flow.id, "primeira");

            expect(response.statusCode).toBe(400);
        });
    });

    describe("POST /api/projects/:projectId/flows/import", () => {
        async function importFlow(yaml: string, contentType = "application/yaml") {
            return app.inject({
                method: "POST",
                url: `/api/projects/${PROJECT_ID}/flows/import`,
                headers: { "content-type": contentType },
                payload: yaml,
            });
        }

        function buildFlowYaml(name: string, graph: FlowGraph): string {
            return flowToYaml({ forja: 1, name, exportedAt: EXPORTED_AT, graph });
        }

        it.each(["application/yaml", "text/yaml", "text/plain"])(
            "creates a flow whose draft is the imported graph (%s)",
            async (contentType) => {
                const yaml = buildFlowYaml("Importado", buildCanonicalFlow());

                const response = await importFlow(yaml, contentType);
                const flow = response.json<FlowSummary>();
                const draft = await app.inject({
                    method: "GET",
                    url: `/api/flows/${flow.id}/draft`,
                });

                expect(response.statusCode).toBe(201);
                expect(flow).toMatchObject({ projectId: PROJECT_ID, name: "Importado" });
                expect(draft.json<FlowDraft>().graph).toEqual(
                    normalizeFlowGraph(buildCanonicalFlow()),
                );
            },
        );

        it("accepts the file sent as a JSON string, as the web client sends it", async () => {
            const yaml = buildFlowYaml("Importado", buildCanonicalFlow());

            const response = await importFlow(JSON.stringify(yaml), "application/json");

            expect(response.statusCode).toBe(201);
            expect(response.json<FlowSummary>()).toMatchObject({ name: "Importado" });
        });

        it("answers 422 with the line and column of broken YAML", async () => {
            const response = await importFlow("forja: 1\nname: [Importado\ngraph: {}\n");

            expect(response.statusCode).toBe(422);
            expect(response.json()).toMatchObject({
                error: {
                    code: "invalid",
                    details: [{ kind: "syntax", line: 3, column: 1 }],
                },
            });
        });

        it("answers 422 for a file of an unknown forja version", async () => {
            const yaml = buildFlowYaml("Importado", buildCanonicalFlow()).replace(
                "forja: 1",
                "forja: 2",
            );

            const response = await importFlow(yaml);

            expect(response.statusCode).toBe(422);
        });

        it("answers 404 for an unknown project", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/projects/prj_nenhum/flows/import",
                headers: { "content-type": "application/yaml" },
                payload: buildFlowYaml("Importado", buildCanonicalFlow()),
            });

            expect(response.statusCode).toBe(404);
        });
    });
});
