import type { FastifyInstance } from "fastify";

import { loadEnv } from "@/lib/env.js";
import { resolvePaths } from "@/lib/paths.js";
import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";

describe("buildApp", () => {
    const paths = resolvePaths("/srv/forja dados", "/home/ana");
    let database: DatabaseHandle;
    let app: FastifyInstance;

    beforeEach(async () => {
        database = createTestDb();
        app = await buildApp({
            env: loadEnv({ FORJA_LOG_LEVEL: "error" }),
            paths,
            options: { seedDemo: false },
            db: database.db,
            events: createEventBus(new FakeClock()),
        });
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    it("answers GET /api/health with the status, the version and the data directory", async () => {
        const response = await app.inject({ method: "GET", url: "/api/health" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            status: "ok",
            version: expect.stringMatching(/^\d+\.\d+\.\d+/) as unknown,
            dataDir: paths.root,
        });
    });

    it("serves the health route only under the /api prefix", async () => {
        const response = await app.inject({ method: "GET", url: "/health" });

        expect(response.statusCode).toBe(404);
    });

    it("answers an unknown /api route with a JSON 404", async () => {
        const response = await app.inject({ method: "GET", url: "/api/inexistente" });

        expect(response.statusCode).toBe(404);
        expect(response.headers["content-type"]).toContain("application/json");
    });

    it("answers invalid input on an /api route with 400 in the ApiErrorBody format", async () => {
        const response = await app.inject({ method: "GET", url: "/api/events?projectId=" });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
            error: { code: "validation_error", message: "Entrada inválida." },
        });
    });
});
