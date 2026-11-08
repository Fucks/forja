import { createSecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import type { SecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import { NotFoundError } from "@/server/errors.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import {
    createCredentialService,
    registerStoredCredentialValues,
} from "@/server/credentials/credential_service.js";
import type { CredentialService } from "@/server/credentials/credential_service.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { credentialInput } from "@/shared/credential_types.js";
import type { CredentialInput } from "@/shared/credential_types.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";
import { createTestSecretBox } from "@/test/test_secrets.js";

const CREATED_AT = new Date("2026-06-01T10:00:00Z");
const ONE_HOUR_MS = 3_600_000;
const ONE_HOUR_LATER = new Date(CREATED_AT.getTime() + ONE_HOUR_MS).toISOString();
const API_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz-a1b2";
const NEW_API_KEY = "sk-ant-api03-zyxwvutsrqponmlkjihgfedcba-z9y8";
const UNKNOWN_ID = "cred_inexistente";

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
    let repo: CredentialRepository;
    let redactor: SecretRedactor;
    let service: CredentialService;

    beforeEach(() => {
        database = createTestDb();
        clock = new FakeClock(CREATED_AT);
        repo = new CredentialRepository(database.db);
        redactor = createSecretRedactor();
        service = createCredentialService({
            repo,
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

    describe("list", () => {
        it("lists the credentials in creation order", async () => {
            await service.create(buildInput({ name: "Anthropic pessoal" }));
            clock.advance(ONE_HOUR_MS);
            await service.create(buildInput({ name: "GitHub", kind: "github_token" }));

            const credentials = await service.list();

            expect(credentials.map((credential) => credential.name)).toEqual([
                "Anthropic pessoal",
                "GitHub",
            ]);
        });
    });

    describe("rename", () => {
        it("changes the name and the update time, keeping the value", async () => {
            const created = await service.create(buildInput());
            clock.advance(ONE_HOUR_MS);

            const renamed = await service.rename(created.id, "Anthropic do time");

            expect(renamed).toEqual({
                ...created,
                name: "Anthropic do time",
                updatedAt: ONE_HOUR_LATER,
            });
            await expect(service.revealForRuntime(created.id)).resolves.toMatchObject({
                value: API_KEY,
            });
        });

        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.rename(UNKNOWN_ID, "Outro")).rejects.toThrow(NotFoundError);
        });
    });

    describe("replaceValue", () => {
        it("seals the new value, updates the mask and registers it in the redactor", async () => {
            const created = await service.create(buildInput());
            clock.advance(ONE_HOUR_MS);

            const replaced = await service.replaceValue(created.id, NEW_API_KEY);

            expect(replaced).toEqual({
                ...created,
                masked: "sk-ant-api03-…z9y8",
                updatedAt: ONE_HOUR_LATER,
            });
            expect(JSON.stringify(readStoredRows())).not.toContain(NEW_API_KEY);
            expect(redactor.redact(NEW_API_KEY)).toBe("••••");
            await expect(service.revealForRuntime(created.id)).resolves.toMatchObject({
                value: NEW_API_KEY,
            });
        });

        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.replaceValue(UNKNOWN_ID, NEW_API_KEY)).rejects.toThrow(
                NotFoundError,
            );
        });
    });

    describe("remove", () => {
        it("deletes the credential", async () => {
            const created = await service.create(buildInput());

            await service.remove(created.id);

            await expect(service.list()).resolves.toEqual([]);
            expect(readStoredRows()).toEqual([]);
        });

        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.remove(UNKNOWN_ID)).rejects.toThrow(NotFoundError);
        });
    });

    describe("revealForRuntime", () => {
        it("opens the sealed value together with its environment variable", async () => {
            const created = await service.create(buildInput());

            const revealed = await service.revealForRuntime(created.id);

            expect(revealed).toEqual({ envVar: "ANTHROPIC_API_KEY", value: API_KEY });
        });

        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.revealForRuntime(UNKNOWN_ID)).rejects.toThrow(NotFoundError);
        });
    });

    describe("recordCheck", () => {
        it("records when the credential was last checked and whether it worked", async () => {
            const created = await service.create(buildInput());
            const checkedAt = new Date(ONE_HOUR_LATER);

            await service.recordCheck(created.id, false, checkedAt);

            const [checked] = await service.list();
            expect(checked).toEqual({
                ...created,
                lastCheckedAt: ONE_HOUR_LATER,
                lastCheckOk: false,
            });
        });

        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.recordCheck(UNKNOWN_ID, true, CREATED_AT)).rejects.toThrow(
                NotFoundError,
            );
        });
    });

    describe("registerStoredCredentialValues", () => {
        it("registers every stored value in a fresh redactor, as on boot", async () => {
            await service.create(buildInput());
            await service.create(buildInput({ kind: "github_token", value: NEW_API_KEY }));
            const bootRedactor = createSecretRedactor();

            registerStoredCredentialValues({
                repo,
                secrets: createTestSecretBox(),
                redactor: bootRedactor,
            });

            expect(bootRedactor.redact(`${API_KEY} ${NEW_API_KEY}`)).toBe("•••• ••••");
        });
    });
});
