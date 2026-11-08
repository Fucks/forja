import { createSecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import type { SecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import { createCredentialService } from "@/server/credentials/credential_service.js";
import type { CredentialService } from "@/server/credentials/credential_service.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { credentialInput } from "@/shared/credential_types.js";
import type { CredentialInput } from "@/shared/credential_types.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";
import { createTestSecretBox } from "@/test/test_secrets.js";

const CREATED_AT = new Date("2026-06-01T10:00:00Z");
const API_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz-a1b2";

function buildInput(overrides: Partial<CredentialInput> = {}): CredentialInput {
    return credentialInput.parse({
        name: "Anthropic pessoal",
        kind: "anthropic_api_key",
        value: API_KEY,
        ...overrides,
    });
}

describe("CredentialService", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let redactor: SecretRedactor;
    let service: CredentialService;

    beforeEach(() => {
        database = createTestDb();
        clock = new FakeClock(CREATED_AT);
        redactor = createSecretRedactor();
        service = createCredentialService({
            repo: new CredentialRepository(database.db),
            secrets: createTestSecretBox(),
            redactor,
            clock,
        });
    });

    afterEach(() => {
        database.close();
    });

    function readStoredRows(): unknown[] {
        return database.sqlite.prepare("SELECT * FROM credentials").all();
    }

    describe("create", () => {
        it("returns a masked summary with the environment variable of the kind", async () => {
            const credential = await service.create(buildInput());

            expect(credential).toEqual({
                id: expect.stringMatching(/^cred_/) as unknown,
                name: "Anthropic pessoal",
                kind: "anthropic_api_key",
                masked: "sk-ant-api03-…a1b2",
                envVar: "ANTHROPIC_API_KEY",
                createdAt: CREATED_AT.toISOString(),
                updatedAt: CREATED_AT.toISOString(),
            });
        });

        it("stores the value sealed, never as plain text", async () => {
            await service.create(buildInput());

            const rows = readStoredRows();

            expect(rows).toHaveLength(1);
            expect(JSON.stringify(rows)).not.toContain(API_KEY);
        });

        it("registers the value so the redactor masks it in texts", async () => {
            await service.create(buildInput());

            expect(redactor.redact(`token=${API_KEY}`)).toBe("token=••••");
        });

        it("uses the given environment variable for a generic credential", async () => {
            const credential = await service.create(
                buildInput({ kind: "generic_env", envVar: "SENTRY_TOKEN" }),
            );

            expect(credential.envVar).toBe("SENTRY_TOKEN");
        });

        it("ignores a custom environment variable for a kind that has a fixed one", async () => {
            const credential = await service.create(
                buildInput({ kind: "github_token", envVar: "MY_TOKEN" }),
            );

            expect(credential.envVar).toBe("GH_TOKEN");
        });
    });
});
