import type { FastifyInstance } from "fastify";

import { loadEnv } from "@/lib/env.js";
import { resolvePaths } from "@/lib/paths.js";
import { buildApp } from "@/server/app.js";

describe("buildApp", () => {
    const paths = resolvePaths("/srv/forja dados", "/home/ana");
    let app: FastifyInstance;

    beforeEach(async () => {
        app = await buildApp({
            env: loadEnv({ FORJA_LOG_LEVEL: "error" }),
            paths,
            options: { seedDemo: false },
        });
    });

    afterEach(async () => {
        await app.close();
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
});
