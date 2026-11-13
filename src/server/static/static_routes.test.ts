import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { type ApiProtection, protectApi } from "@/server/security/api_protection.js";
import { serveWebApp } from "@/server/static/static_routes.js";

const INDEX_HTML = "<!doctype html><title>Forja</title>";
const SCRIPT_SOURCE = "console.log('forja');";
const WITHOUT_PROTECTION: ApiProtection = { kind: "none" };
const SESSION_PROTECTION: ApiProtection = {
    kind: "session",
    token: "token-da-sessao",
    port: 4317,
    allowsDevServer: false,
};
const SESSION_COOKIE = "forja_session=token-da-sessao; Path=/; HttpOnly; SameSite=Strict";

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
        await serveWebApp(app, webDir, WITHOUT_PROTECTION);

        const response = await app.inject({ method: "GET", url: "/" });

        expect(response.statusCode).toBe(200);
        expect(response.body).toBe(INDEX_HTML);
    });

    it("serves the files of the web app", async () => {
        await serveWebApp(app, webDir, WITHOUT_PROTECTION);

        const response = await app.inject({ method: "GET", url: "/assets/main.js" });

        expect(response.statusCode).toBe(200);
        expect(response.body).toBe(SCRIPT_SOURCE);
    });

    it("answers an unknown route with index.html so the SPA can route it", async () => {
        await serveWebApp(app, webDir, WITHOUT_PROTECTION);

        const response = await app.inject({ method: "GET", url: "/qualquer/rota" });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("text/html");
        expect(response.body).toBe(INDEX_HTML);
    });

    it("answers an unknown /api route with a JSON 404 instead of index.html", async () => {
        await serveWebApp(app, webDir, WITHOUT_PROTECTION);

        const response = await app.inject({ method: "GET", url: "/api/x" });

        expect(response.statusCode).toBe(404);
        expect(response.headers["content-type"]).toContain("application/json");
        expect(response.body).not.toBe(INDEX_HTML);
    });

    it("answers a POST to an unknown route with a 404 instead of index.html", async () => {
        await serveWebApp(app, webDir, WITHOUT_PROTECTION);

        const response = await app.inject({ method: "POST", url: "/qualquer/rota" });

        expect(response.statusCode).toBe(404);
        expect(response.body).not.toBe(INDEX_HTML);
    });

    it("hands the session cookie out with index.html at the root", async () => {
        await serveWebApp(app, webDir, SESSION_PROTECTION);

        const response = await app.inject({ method: "GET", url: "/" });

        expect(response.headers["set-cookie"]).toBe(SESSION_COOKIE);
    });

    it("hands the session cookie out with index.html on a route of the SPA", async () => {
        await serveWebApp(app, webDir, SESSION_PROTECTION);

        const response = await app.inject({ method: "GET", url: "/qualquer/rota" });

        expect(response.headers["set-cookie"]).toBe(SESSION_COOKIE);
    });

    it("keeps the session cookie out of the other files", async () => {
        await serveWebApp(app, webDir, SESSION_PROTECTION);

        const response = await app.inject({ method: "GET", url: "/assets/main.js" });

        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("hands out the cookie that opens the protected API to the page it serves", async () => {
        protectApi(app, SESSION_PROTECTION);
        app.get("/api/ping", () => ({ pong: true }));
        await serveWebApp(app, webDir, SESSION_PROTECTION);
        const host = "127.0.0.1:4317";
        const page = await app.inject({ method: "GET", url: "/", headers: { host } });
        const [sessionCookie] = String(page.headers["set-cookie"]).split(";");

        const response = await app.inject({
            method: "GET",
            url: "/api/ping",
            headers: { host, cookie: sessionCookie },
        });

        expect(page.statusCode).toBe(200);
        expect(response.json()).toEqual({ pong: true });
    });

    it("hands no cookie out without the session protection", async () => {
        await serveWebApp(app, webDir, WITHOUT_PROTECTION);

        const response = await app.inject({ method: "GET", url: "/" });

        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("registers nothing when the web app folder does not exist", async () => {
        await serveWebApp(app, path.join(webDir, "inexistente"), WITHOUT_PROTECTION);

        const response = await app.inject({ method: "GET", url: "/qualquer/rota" });

        expect(response.statusCode).toBe(404);
    });
});
