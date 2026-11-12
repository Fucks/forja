import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

describe("security headers", () => {
    let database: DatabaseHandle;
    let app: FastifyInstance;

    async function startApp(overrides: Parameters<typeof createTestAppDeps>[1] = {}) {
        app = await buildApp(createTestAppDeps(database.db, overrides));
    }

    beforeEach(() => {
        database = createTestDb();
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    it("tells the browser not to guess types nor send the referrer", async () => {
        await startApp();

        const response = await app.inject({ method: "GET", url: "/api/health" });

        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["referrer-policy"]).toBe("no-referrer");
    });

    it("limits what the page loads to the app itself", async () => {
        await startApp();

        const response = await app.inject({ method: "GET", url: "/api/health" });

        const policy = String(response.headers["content-security-policy"]);
        expect(policy).toContain("default-src 'self'");
        expect(policy).toContain("frame-ancestors 'none'");
        expect(policy).not.toContain("script-src");
    });

    it("sends the headers on the answers the guard rejects", async () => {
        await startApp({
            apiProtection: { kind: "session", token: "t", port: 4317, allowsDevServer: false },
        });

        const response = await app.inject({ method: "GET", url: "/api/health" });

        expect(response.statusCode).toBe(403);
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });
});
