import type { FastifyInstance } from "fastify";

import { createSecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import type { CredentialSummary } from "@/shared/credential_types.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const API_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz-a1b2";
const NEW_API_KEY = "sk-ant-api03-zyxwvutsrqponmlkjihgfedcba-z9y8";

describe("credentials routes", () => {
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

    async function createAnthropicKey(): Promise<CredentialSummary> {
        const response = await app.inject({
            method: "POST",
            url: "/api/credentials",
            payload: { name: "Anthropic", kind: "anthropic_api_key", value: API_KEY },
        });
        return response.json<CredentialSummary>();
    }

    it("answers 201 with the masked summary and without the value", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/credentials",
            payload: { name: "Anthropic", kind: "anthropic_api_key", value: API_KEY },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({
            name: "Anthropic",
            kind: "anthropic_api_key",
            masked: "sk-ant-api03-…a1b2",
            envVar: "ANTHROPIC_API_KEY",
        });
        expect(response.body).not.toContain(API_KEY);
        expect(response.body).not.toContain("sealed");
    });

    it("lists the credentials without their values", async () => {
        const created = await createAnthropicKey();

        const response = await app.inject({ method: "GET", url: "/api/credentials" });

        expect(response.json()).toEqual([created]);
        expect(response.body).not.toContain(API_KEY);
    });

    it("answers 400 for a generic credential without an environment variable", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/credentials",
            payload: { name: "Sentry", kind: "generic_env", value: "sentry-token-123" },
        });

        expect(response.statusCode).toBe(400);
    });

    it("answers 400 for an environment variable that is not upper snake case", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/credentials",
            payload: {
                name: "Sentry",
                kind: "generic_env",
                value: "sentry-token-123",
                envVar: "sentry-token",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("answers 400 for an unknown kind", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/credentials",
            payload: { name: "AWS", kind: "aws_key", value: API_KEY },
        });

        expect(response.statusCode).toBe(400);
    });

    it("renames and replaces the value with PATCH, answering without the value", async () => {
        const created = await createAnthropicKey();

        const response = await app.inject({
            method: "PATCH",
            url: `/api/credentials/${created.id}`,
            payload: { name: "Anthropic do time", value: NEW_API_KEY },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: created.id,
            name: "Anthropic do time",
            masked: "sk-ant-api03-…z9y8",
        });
        expect(response.body).not.toContain(NEW_API_KEY);
    });

    it("answers 400 for a PATCH without name or value", async () => {
        const created = await createAnthropicKey();

        const response = await app.inject({
            method: "PATCH",
            url: `/api/credentials/${created.id}`,
            payload: {},
        });

        expect(response.statusCode).toBe(400);
    });

    it("answers 400 for a PATCH with an empty name next to a new value", async () => {
        const created = await createAnthropicKey();

        const response = await app.inject({
            method: "PATCH",
            url: `/api/credentials/${created.id}`,
            payload: { name: "  ", value: NEW_API_KEY },
        });

        expect(response.statusCode).toBe(400);
    });

    it("answers 404 for a PATCH on an unknown credential", async () => {
        const response = await app.inject({
            method: "PATCH",
            url: "/api/credentials/cred_inexistente",
            payload: { name: "Outro" },
        });

        expect(response.statusCode).toBe(404);
    });

    it("answers 204 when removing and 404 when removing again", async () => {
        const created = await createAnthropicKey();

        const removing = await app.inject({
            method: "DELETE",
            url: `/api/credentials/${created.id}`,
        });
        const removingAgain = await app.inject({
            method: "DELETE",
            url: `/api/credentials/${created.id}`,
        });

        expect(removing.statusCode).toBe(204);
        expect(removingAgain.statusCode).toBe(404);
    });

    it("registers the stored values in the redactor when the app starts", async () => {
        await createAnthropicKey();
        await app.close();
        const bootRedactor = createSecretRedactor();

        app = await buildApp(createTestAppDeps(database.db, { redactor: bootRedactor }));
        await app.ready();

        expect(bootRedactor.redact(API_KEY)).toBe("••••");
    });
});
