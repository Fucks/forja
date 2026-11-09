import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import type { DiagnosticReport } from "@/shared/diagnostic_types.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

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

    it("answers the report with one item per check", async () => {
        const response = await app.inject({ method: "GET", url: "/api/diagnostics" });

        expect(response.statusCode).toBe(200);
        expect(response.json<DiagnosticReport>().items.map((item) => item.id)).toEqual([
            "node",
            "git",
            "docker",
            "gh",
            "gh-auth",
        ]);
    });

    it("runs the checks again with force=1 instead of answering from the cache", async () => {
        await app.inject({ method: "GET", url: "/api/diagnostics" });
        const callsAfterFirstCheck = commands.calls.length;

        await app.inject({ method: "GET", url: "/api/diagnostics?force=1" });

        expect(commands.calls.length).toBeGreaterThan(callsAfterFirstCheck);
    });
});
