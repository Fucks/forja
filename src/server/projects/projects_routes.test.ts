import type { FastifyInstance } from "fastify";

import type { RepoInfo } from "@/integrations/git/git_provider.js";
import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import type { Project } from "@/server/projects/project_types.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const FORJA_REPO: RepoInfo = {
    root: "/repos/forja",
    currentBranch: "main",
    defaultBranch: "main",
    remoteUrl: "https://github.com/Fucks/forja.git",
    githubRepo: "Fucks/forja",
};

describe("projects routes", () => {
    let database: DatabaseHandle;
    let app: FastifyInstance;

    beforeEach(async () => {
        database = createTestDb();
        const git = new FakeGitProvider();
        git.addRepo(FORJA_REPO, { subdirectories: ["/repos/forja/src"] });
        app = await buildApp(createTestAppDeps(database.db, { git }));
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    async function createForja(): Promise<Project> {
        const response = await app.inject({
            method: "POST",
            url: "/api/projects",
            payload: { name: "Forja", repoPath: "/repos/forja/src" },
        });
        return response.json<Project>();
    }

    describe("POST /api/projects", () => {
        it("answers 201 with the project registered at the repository root", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/projects",
                payload: { name: "Forja", repoPath: "/repos/forja/src" },
            });

            expect(response.statusCode).toBe(201);
            expect(response.json()).toMatchObject({
                name: "Forja",
                repoPath: "/repos/forja",
                githubRepo: "Fucks/forja",
                baseBranch: "main",
            });
        });

        it("answers 422 with a clear message when the path is not a git repository", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/projects",
                payload: { name: "Solto", repoPath: "/tmp/solto" },
            });

            expect(response.statusCode).toBe(422);
            expect(response.json()).toMatchObject({
                error: {
                    code: "invalid",
                    message: "O caminho /tmp/solto não é um repositório git.",
                },
            });
        });

        it("answers 409 when the repository is already registered", async () => {
            await createForja();

            const response = await app.inject({
                method: "POST",
                url: "/api/projects",
                payload: { name: "Outra Forja", repoPath: "/repos/forja" },
            });

            expect(response.statusCode).toBe(409);
            expect(response.json()).toMatchObject({ error: { code: "conflict" } });
        });

        it("answers 400 when the name is blank", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/projects",
                payload: { name: "   ", repoPath: "/repos/forja" },
            });

            expect(response.statusCode).toBe(400);
            expect(response.json()).toMatchObject({ error: { code: "validation_error" } });
        });
    });

    describe("GET /api/projects", () => {
        it("answers the registered projects", async () => {
            const created = await createForja();

            const response = await app.inject({ method: "GET", url: "/api/projects" });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual([created]);
        });
    });

    describe("GET /api/projects/:id", () => {
        it("answers the project", async () => {
            const created = await createForja();

            const response = await app.inject({
                method: "GET",
                url: `/api/projects/${created.id}`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual(created);
        });

        it("answers 404 for an unknown id", async () => {
            const response = await app.inject({ method: "GET", url: "/api/projects/prj_nenhum" });

            expect(response.statusCode).toBe(404);
            expect(response.json()).toMatchObject({ error: { code: "not_found" } });
        });
    });

    describe("PATCH /api/projects/:id", () => {
        it("answers the renamed project", async () => {
            const created = await createForja();

            const response = await app.inject({
                method: "PATCH",
                url: `/api/projects/${created.id}`,
                payload: { name: "  Forja 2  " },
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ id: created.id, name: "Forja 2" });
        });

        it("answers 404 for an unknown id", async () => {
            const response = await app.inject({
                method: "PATCH",
                url: "/api/projects/prj_nenhum",
                payload: { name: "Nada" },
            });

            expect(response.statusCode).toBe(404);
        });
    });

    describe("DELETE /api/projects/:id", () => {
        it("answers 204 and forgets the project", async () => {
            const created = await createForja();

            const response = await app.inject({
                method: "DELETE",
                url: `/api/projects/${created.id}`,
            });

            expect(response.statusCode).toBe(204);
            const lookup = await app.inject({ method: "GET", url: `/api/projects/${created.id}` });
            expect(lookup.statusCode).toBe(404);
        });

        it("answers 404 for an unknown id", async () => {
            const response = await app.inject({
                method: "DELETE",
                url: "/api/projects/prj_nenhum",
            });

            expect(response.statusCode).toBe(404);
        });
    });
});
