import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import type { ToolProfile } from "@/shared/tool_profile_types.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const CODEGRAPH_SERVER = { name: "codegraph", command: "codegraph", args: ["serve", "--mcp"] };

describe("tool profiles routes", () => {
    let database: DatabaseHandle;
    let app: FastifyInstance;

    beforeEach(async () => {
        database = createTestDb();
        app = await buildApp(createTestAppDeps(database.db));
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    async function createReviewer(): Promise<ToolProfile> {
        const response = await app.inject({
            method: "POST",
            url: "/api/tool-profiles",
            payload: { name: "Revisor", disallowedTools: ["Write"] },
        });
        return response.json<ToolProfile>();
    }

    it("answers 201 with the created profile filled with defaults", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/tool-profiles",
            payload: { name: "Revisor", mcpServers: [CODEGRAPH_SERVER] },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({
            name: "Revisor",
            description: "",
            mcpServers: [{ ...CODEGRAPH_SERVER, env: {} }],
            permissionMode: "bypassPermissions",
            builtin: false,
        });
    });

    it("lists the presets followed by the created profiles", async () => {
        const reviewer = await createReviewer();

        const response = await app.inject({ method: "GET", url: "/api/tool-profiles" });

        expect(response.json<ToolProfile[]>().map((profile) => profile.id)).toEqual([
            "tlp_builtin_codegraph",
            "tlp_builtin_readonly",
            "tlp_builtin_default",
            reviewer.id,
        ]);
    });

    it("answers 422 when two MCP servers share a name", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/tool-profiles",
            payload: { name: "Revisor", mcpServers: [CODEGRAPH_SERVER, CODEGRAPH_SERVER] },
        });

        expect(response.statusCode).toBe(422);
    });

    it("answers 400 for an unknown permission mode", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/tool-profiles",
            payload: { name: "Revisor", permissionMode: "yolo" },
        });

        expect(response.statusCode).toBe(400);
    });

    it("replaces a profile with PUT", async () => {
        const reviewer = await createReviewer();

        const response = await app.inject({
            method: "PUT",
            url: `/api/tool-profiles/${reviewer.id}`,
            payload: { name: "Revisor estrito", permissionMode: "plan" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: reviewer.id,
            name: "Revisor estrito",
            disallowedTools: [],
            permissionMode: "plan",
        });
    });

    it("answers 409 when editing or removing a preset", async () => {
        const editing = await app.inject({
            method: "PUT",
            url: "/api/tool-profiles/tlp_builtin_codegraph",
            payload: { name: "Meu CodeGraph" },
        });
        const removing = await app.inject({
            method: "DELETE",
            url: "/api/tool-profiles/tlp_builtin_readonly",
        });

        expect(editing.statusCode).toBe(409);
        expect(removing.statusCode).toBe(409);
    });

    it("answers 204 when removing a profile and 404 when reading it afterwards", async () => {
        const reviewer = await createReviewer();

        const removing = await app.inject({
            method: "DELETE",
            url: `/api/tool-profiles/${reviewer.id}`,
        });
        const reading = await app.inject({
            method: "GET",
            url: `/api/tool-profiles/${reviewer.id}`,
        });

        expect(removing.statusCode).toBe(204);
        expect(reading.statusCode).toBe(404);
    });

    it("answers 201 with an editable copy when duplicating a preset", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/tool-profiles/tlp_builtin_codegraph/duplicate",
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({
            name: "CodeGraph (cópia)",
            builtin: false,
            indexCodegraphOnStart: true,
        });
    });
});
