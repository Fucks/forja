import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const PROJECT_ID = "prj_forja";
const PROJECT_SETTINGS_URL = `/api/projects/${PROJECT_ID}/settings`;

describe("settings routes", () => {
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

    it("answers the project defaults when the project was never configured", async () => {
        const response = await app.inject({ method: "GET", url: PROJECT_SETTINGS_URL });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(DEFAULT_PROJECT_SETTINGS);
    });

    it("saves the project settings, filling the missing fields with the defaults", async () => {
        await app.inject({
            method: "PUT",
            url: PROJECT_SETTINGS_URL,
            payload: { defaultEffort: "max" },
        });

        const response = await app.inject({ method: "GET", url: PROJECT_SETTINGS_URL });

        expect(response.json()).toEqual({ ...DEFAULT_PROJECT_SETTINGS, defaultEffort: "max" });
    });

    it("answers 404 for the settings of an unknown project", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/api/projects/prj_inexistente/settings",
        });

        expect(response.statusCode).toBe(404);
    });

    it.each([
        { defaultCredentialId: "cred_inexistente" },
        { githubCredentialId: "cred_inexistente" },
        { defaultToolProfileId: "tlp_inexistente" },
    ])("answers 422 for a PUT referencing %o", async (unknownReference) => {
        const response = await app.inject({
            method: "PUT",
            url: PROJECT_SETTINGS_URL,
            payload: unknownReference,
        });

        expect(response.statusCode).toBe(422);
    });

    it("answers 400 for an effort outside the known levels", async () => {
        const response = await app.inject({
            method: "PUT",
            url: PROJECT_SETTINGS_URL,
            payload: { defaultEffort: "extreme" },
        });

        expect(response.statusCode).toBe(400);
    });

    it("answers the global defaults when nothing was saved", async () => {
        const response = await app.inject({ method: "GET", url: "/api/settings" });

        expect(response.json()).toEqual(DEFAULT_GLOBAL_SETTINGS);
    });

    it("saves the global settings", async () => {
        await app.inject({
            method: "PUT",
            url: "/api/settings",
            payload: { maxConcurrentAgents: 6 },
        });

        const response = await app.inject({ method: "GET", url: "/api/settings" });

        expect(response.json()).toEqual({ ...DEFAULT_GLOBAL_SETTINGS, maxConcurrentAgents: 6 });
    });
});
