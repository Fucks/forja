import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import type { DiagnosticReport } from "@/shared/diagnostic_types.js";
import { DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const SAVED_AT = "2026-11-09T12:00:00.000Z";

describe("diagnostics routes", () => {
    let database: DatabaseHandle;
    let commands: FakeCommandRunner;
    let app: FastifyInstance;

    beforeEach(async () => {
        database = createTestDb();
        commands = new FakeCommandRunner();
        app = await buildApp(createTestAppDeps(database.db, { commands }));
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    it("answers the report with one item per check, with the default agent image when there is no project", async () => {
        const response = await app.inject({ method: "GET", url: "/api/diagnostics" });

        expect(response.statusCode).toBe(200);
        expect(response.json<DiagnosticReport>().items.map((item) => item.id)).toEqual([
            "node",
            "git",
            "docker",
            "gh",
            "gh-auth",
            "agent-image:forja-agent:latest",
        ]);
    });

    it("checks each distinct agent image configured by the projects", async () => {
        const projects = new ProjectRepository(database.db);
        const settings = new SettingsRepository(database.db);
        for (const id of ["prj_forja", "prj_loja", "prj_site"]) {
            projects.insert(buildProject({ id }));
        }
        const customImage = { ...DEFAULT_PROJECT_SETTINGS, agentImage: "loja-agent:1.0" };
        settings.saveProjectSettings("prj_loja", customImage, SAVED_AT);

        const response = await app.inject({ method: "GET", url: "/api/diagnostics" });

        const imageItemIds = response
            .json<DiagnosticReport>()
            .items.map((item) => item.id)
            .filter((id) => id.startsWith("agent-image:"));
        expect(imageItemIds).toEqual([
            "agent-image:forja-agent:latest",
            "agent-image:loja-agent:1.0",
        ]);
    });

    it("runs the checks again with force=1 instead of answering from the cache", async () => {
        await app.inject({ method: "GET", url: "/api/diagnostics" });
        const callsAfterFirstCheck = commands.calls.length;

        await app.inject({ method: "GET", url: "/api/diagnostics?force=1" });

        expect(commands.calls.length).toBeGreaterThan(callsAfterFirstCheck);
    });
});
