import type { FastifyInstance } from "fastify";

import {
    createScriptedAgentOutputs,
    type ScriptedAgentOutputs,
} from "@/integrations/agent_runtime/scripted_agent_outputs.js";
import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const OUTPUTS_URL = "/api/scripted-agents/outputs";
const REVIEWER_PROMPT = "Revise as mudanças do Dev.";
const APPROVED = { approved: true, notes: "" };

describe("scripted agents routes", () => {
    let database: DatabaseHandle;
    let app: FastifyInstance | undefined;

    beforeEach(() => {
        database = createTestDb();
    });

    afterEach(async () => {
        await app?.close();
        database.close();
    });

    async function startApp(scriptedAgentOutputs?: ScriptedAgentOutputs): Promise<FastifyInstance> {
        app = await buildApp(createTestAppDeps(database.db, { scriptedAgentOutputs }));
        return app;
    }

    it("replaces the outputs the simulated agents give", async () => {
        const outputs = createScriptedAgentOutputs();
        const startedApp = await startApp(outputs);

        const response = await startedApp.inject({
            method: "PUT",
            url: OUTPUTS_URL,
            payload: { rules: [{ promptIncludes: "Revise", outputs: [APPROVED] }] },
        });

        expect(response.statusCode).toBe(204);
        expect(outputs.takeNext(REVIEWER_PROMPT)).toEqual({ isScripted: true, output: APPROVED });
    });

    it("rejects a rule without outputs", async () => {
        const startedApp = await startApp(createScriptedAgentOutputs());

        const response = await startedApp.inject({
            method: "PUT",
            url: OUTPUTS_URL,
            payload: { rules: [{ promptIncludes: "Revise", outputs: [] }] },
        });

        expect(response.statusCode).toBe(400);
    });

    it("does not exist when the agents are real", async () => {
        const startedApp = await startApp();

        const response = await startedApp.inject({
            method: "PUT",
            url: OUTPUTS_URL,
            payload: { rules: [] },
        });

        expect(response.statusCode).toBe(404);
    });
});
