import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import type { LocalItemInput, WorkItem } from "@/shared/work_item_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildWorkItem } from "@/test/factories/work_item_factory.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const PROJECT_ID = "prj_forja";

describe("work items routes", () => {
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

    async function createItem(payload: Partial<LocalItemInput> = {}): Promise<WorkItem> {
        const response = await app.inject({
            method: "POST",
            url: `/api/projects/${PROJECT_ID}/work-items`,
            payload: { title: "Tela de login", ...payload },
        });
        return response.json<WorkItem>();
    }

    function insertGithubItem(): WorkItem {
        const githubItem = buildWorkItem({ projectId: PROJECT_ID });
        new WorkItemRepository(database.db).insert(githubItem);
        return githubItem;
    }

    describe("POST /api/projects/:projectId/work-items", () => {
        it("answers 201 with the new local item and its branch", async () => {
            const response = await app.inject({
                method: "POST",
                url: `/api/projects/${PROJECT_ID}/work-items`,
                payload: { title: "Tela de login" },
            });

            expect(response.statusCode).toBe(201);
            expect(response.json()).toMatchObject({
                projectId: PROJECT_ID,
                source: "local",
                title: "Tela de login",
                body: "",
                labels: [],
                blockedBy: [],
                state: "open",
                branch: expect.stringMatching(/^forja\/item-/) as unknown,
            });
        });

        it("answers 400 when the title is blank", async () => {
            const response = await app.inject({
                method: "POST",
                url: `/api/projects/${PROJECT_ID}/work-items`,
                payload: { title: "   " },
            });

            expect(response.statusCode).toBe(400);
            expect(response.json()).toMatchObject({ error: { code: "validation_error" } });
        });

        it("answers 422 when a blocker is unknown", async () => {
            const response = await app.inject({
                method: "POST",
                url: `/api/projects/${PROJECT_ID}/work-items`,
                payload: { title: "Tela de login", blockedBy: ["itm_nenhum"] },
            });

            expect(response.statusCode).toBe(422);
        });

        it("answers 404 for an unknown project", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/projects/prj_nenhum/work-items",
                payload: { title: "Tela de login" },
            });

            expect(response.statusCode).toBe(404);
        });
    });

    describe("GET /api/projects/:projectId/work-items", () => {
        it("lists the items filtered by the query", async () => {
            const frontend = await createItem({ labels: ["frontend"] });
            await createItem({ labels: ["backend"] });

            const response = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/work-items?label=frontend&state=open`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json<WorkItem[]>().map((item) => item.id)).toEqual([frontend.id]);
        });

        it("includes archived items when asked", async () => {
            const item = await createItem();
            await app.inject({ method: "POST", url: `/api/work-items/${item.id}/archive` });

            const withoutArchived = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/work-items`,
            });
            const withArchived = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/work-items?includeArchived=true`,
            });

            expect(withoutArchived.json()).toEqual([]);
            expect(withArchived.json<WorkItem[]>().map((listed) => listed.id)).toEqual([item.id]);
        });
    });

    describe("GET /api/work-items/:id", () => {
        it("answers the item", async () => {
            const item = await createItem();

            const response = await app.inject({ method: "GET", url: `/api/work-items/${item.id}` });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual(item);
        });

        it("answers 404 for an unknown item", async () => {
            const response = await app.inject({ method: "GET", url: "/api/work-items/itm_nenhum" });

            expect(response.statusCode).toBe(404);
        });
    });

    describe("PATCH /api/work-items/:id", () => {
        it("edits only the fields sent", async () => {
            const item = await createItem({ body: "Descrição", labels: ["frontend"] });

            const response = await app.inject({
                method: "PATCH",
                url: `/api/work-items/${item.id}`,
                payload: { title: "Novo título", state: "closed" },
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({
                title: "Novo título",
                state: "closed",
                body: "Descrição",
                labels: ["frontend"],
                branch: item.branch,
            });
        });

        it("answers 409 for a GitHub item", async () => {
            const githubItem = insertGithubItem();

            const response = await app.inject({
                method: "PATCH",
                url: `/api/work-items/${githubItem.id}`,
                payload: { title: "Outro" },
            });

            expect(response.statusCode).toBe(409);
            expect(response.json()).toMatchObject({ error: { code: "conflict" } });
        });

        it("answers 400 for an unknown state", async () => {
            const item = await createItem();

            const response = await app.inject({
                method: "PATCH",
                url: `/api/work-items/${item.id}`,
                payload: { state: "merged" },
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe("POST /api/work-items/:id/column", () => {
        it("sets the manual column of a GitHub item", async () => {
            const githubItem = insertGithubItem();

            const response = await app.inject({
                method: "POST",
                url: `/api/work-items/${githubItem.id}/column`,
                payload: { column: "done" },
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ manualColumn: "done" });
        });

        it("clears the manual column with null", async () => {
            const item = await createItem();
            await app.inject({
                method: "POST",
                url: `/api/work-items/${item.id}/column`,
                payload: { column: "needs_human" },
            });

            const response = await app.inject({
                method: "POST",
                url: `/api/work-items/${item.id}/column`,
                payload: { column: null },
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).not.toHaveProperty("manualColumn");
        });

        it("answers 400 for an unknown column", async () => {
            const item = await createItem();

            const response = await app.inject({
                method: "POST",
                url: `/api/work-items/${item.id}/column`,
                payload: { column: "review" },
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe("POST /api/work-items/:id/archive", () => {
        it("answers the archived local item", async () => {
            const item = await createItem();

            const response = await app.inject({
                method: "POST",
                url: `/api/work-items/${item.id}/archive`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ id: item.id, archived: true });
        });

        it("answers 409 for a GitHub item", async () => {
            const githubItem = insertGithubItem();

            const response = await app.inject({
                method: "POST",
                url: `/api/work-items/${githubItem.id}/archive`,
            });

            expect(response.statusCode).toBe(409);
        });
    });
});
