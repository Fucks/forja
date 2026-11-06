import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { serveWebApp } from "@/server/static/static_routes.js";

const INDEX_HTML = "<!doctype html><title>Forja</title>";
const SCRIPT_SOURCE = "console.log('forja');";

describe("serveWebApp", () => {
    let webDir: string;
    let app: FastifyInstance;

    beforeEach(() => {
        webDir = mkdtempSync(path.join(tmpdir(), "forja web "));
        writeFileSync(path.join(webDir, "index.html"), INDEX_HTML);
        mkdirSync(path.join(webDir, "assets"));
        writeFileSync(path.join(webDir, "assets", "main.js"), SCRIPT_SOURCE);
        app = Fastify();
    });

    afterEach(async () => {
        await app.close();
        rmSync(webDir, { recursive: true, force: true });
    });

    it("serves index.html at the root", async () => {
        await serveWebApp(app, webDir);

        const response = await app.inject({ method: "GET", url: "/" });

        expect(response.statusCode).toBe(200);
        expect(response.body).toBe(INDEX_HTML);
    });

    it("serves the files of the web app", async () => {
        await serveWebApp(app, webDir);

        const response = await app.inject({ method: "GET", url: "/assets/main.js" });

        expect(response.statusCode).toBe(200);
        expect(response.body).toBe(SCRIPT_SOURCE);
    });

    it("answers an unknown route with index.html so the SPA can route it", async () => {
        await serveWebApp(app, webDir);

        const response = await app.inject({ method: "GET", url: "/qualquer/rota" });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("text/html");
        expect(response.body).toBe(INDEX_HTML);
    });

    it("answers an unknown /api route with a JSON 404 instead of index.html", async () => {
        await serveWebApp(app, webDir);

        const response = await app.inject({ method: "GET", url: "/api/x" });

        expect(response.statusCode).toBe(404);
        expect(response.headers["content-type"]).toContain("application/json");
        expect(response.body).not.toBe(INDEX_HTML);
    });

    it("answers a POST to an unknown route with a 404 instead of index.html", async () => {
        await serveWebApp(app, webDir);

        const response = await app.inject({ method: "POST", url: "/qualquer/rota" });

        expect(response.statusCode).toBe(404);
        expect(response.body).not.toBe(INDEX_HTML);
    });

    it("registers nothing when the web app folder does not exist", async () => {
        await serveWebApp(app, path.join(webDir, "inexistente"));

        const response = await app.inject({ method: "GET", url: "/qualquer/rota" });

        expect(response.statusCode).toBe(404);
    });
});
