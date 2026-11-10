import { createSecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import {
    checkCredential,
    type CredentialCheckDeps,
} from "@/server/credentials/credential_check.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import {
    createCredentialService,
    type CredentialService,
} from "@/server/credentials/credential_service.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { DomainValidationError } from "@/server/errors.js";
import type { CredentialInput, CredentialSummary } from "@/shared/credential_types.js";
import { FakeAgentRuntime } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";
import { createTestDb } from "@/test/test_db.js";
import { createTestSecretBox } from "@/test/test_secrets.js";

const API_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz-a1b2";
const OAUTH_TOKEN = "sk-ant-oat01-abcdefghijklmnopqrstuvwxyz-c3d4";
const GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
const SANDBOX = { repoPath: "/srv/forja/tmp/credential-check", image: "forja-agent:latest" };
const TIME_STEP_MS = 1_000;
const TWO_MINUTES_MS = 2 * 60_000;

describe("checkCredential", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let credentials: CredentialService;
    let runtime: FakeAgentRuntime;
    let commands: FakeCommandRunner;
    let deps: CredentialCheckDeps;

    beforeEach(() => {
        database = createTestDb();
        clock = new FakeClock();
        credentials = createCredentialService({
            repo: new CredentialRepository(database.db),
            secrets: createTestSecretBox(),
            redactor: createSecretRedactor(),
            clock,
        });
        runtime = new FakeAgentRuntime({ clock });
        commands = new FakeCommandRunner();
        deps = { credentials, runtime, commands, clock, sandbox: SANDBOX };
    });

    afterEach(() => {
        database.close();
    });

    function createCredential(input: CredentialInput): Promise<CredentialSummary> {
        return credentials.create(input);
    }

    // The fake agent takes fake time to answer, so the clock moves until the check settles.
    async function checkWhileTimePasses(id: string): Promise<{ ok: boolean; message: string }> {
        let isSettled = false;
        const checking = checkCredential(id, deps).finally(() => {
            isSettled = true;
        });
        await settlePendingWork();
        while (!isSettled) {
            clock.advance(TIME_STEP_MS);
            await settlePendingWork();
        }

        return checking;
    }

    async function findSummary(id: string): Promise<CredentialSummary | undefined> {
        return (await credentials.list()).find((credential) => credential.id === id);
    }

    describe("for a Claude credential", () => {
        it("runs a minimal headless agent with the credential in its env", async () => {
            const credential = await createCredential({
                name: "Assinatura",
                kind: "claude_oauth_token",
                value: OAUTH_TOKEN,
            });

            await checkWhileTimePasses(credential.id);

            expect(runtime.requests).toEqual([
                expect.objectContaining({
                    prompt: "Responda apenas OK",
                    model: "haiku",
                    maxIterations: 1,
                    timeoutMs: TWO_MINUTES_MS,
                    toolArgs: [],
                    env: { CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN },
                }),
            ]);
        });

        it("succeeds and records the check when the agent answers", async () => {
            const credential = await createCredential({
                name: "Anthropic",
                kind: "anthropic_api_key",
                value: API_KEY,
            });

            const result = await checkWhileTimePasses(credential.id);

            expect(result).toEqual({ ok: true, message: "Credencial válida" });
            expect(await findSummary(credential.id)).toMatchObject({
                lastCheckOk: true,
                lastCheckedAt: clock.now().toISOString(),
            });
        });

        it("fails with the error of the agent and records the failed check", async () => {
            const credential = await createCredential({
                name: "Anthropic",
                kind: "anthropic_api_key",
                value: API_KEY,
            });
            runtime.script({
                match: { promptIncludes: "Responda apenas OK" },
                durationMs: TIME_STEP_MS,
                error: { type: "runtime", message: "Invalid API key" },
            });

            const result = await checkWhileTimePasses(credential.id);

            expect(result).toEqual({ ok: false, message: "Invalid API key" });
            expect(await findSummary(credential.id)).toMatchObject({
                lastCheckOk: false,
                lastCheckedAt: clock.now().toISOString(),
            });
        });
    });

    describe("for a GitHub token", () => {
        it("runs gh auth status with the token only in its env", async () => {
            const credential = await createCredential({
                name: "GitHub",
                kind: "github_token",
                value: GITHUB_TOKEN,
            });
            commands.when("gh", ["auth", "status"]).returns({ exitCode: 0 });

            const result = await checkCredential(credential.id, deps);

            expect(result).toEqual({ ok: true, message: "Credencial válida" });
            const [ghCall] = commands.calls;
            expect(ghCall?.options.env).toEqual({ GH_TOKEN: GITHUB_TOKEN, GITHUB_TOKEN });
            const everyArgument = commands.calls.flatMap((call) => call.args).join(" ");
            expect(everyArgument).not.toContain(GITHUB_TOKEN);
        });

        it("fails with the output of gh and records the failed check", async () => {
            const credential = await createCredential({
                name: "GitHub",
                kind: "github_token",
                value: GITHUB_TOKEN,
            });
            commands.when("gh", ["auth", "status"]).returns({
                exitCode: 1,
                stderr: "The token in GH_TOKEN is invalid.\n",
            });

            const result = await checkCredential(credential.id, deps);

            expect(result).toEqual({ ok: false, message: "The token in GH_TOKEN is invalid." });
            expect(await findSummary(credential.id)).toMatchObject({ lastCheckOk: false });
        });
    });

    it("refuses to check a generic credential, which has nothing to run", async () => {
        const credential = await createCredential({
            name: "Sentry",
            kind: "generic_env",
            value: "sentry-token-123",
            envVar: "SENTRY_TOKEN",
        });

        await expect(checkCredential(credential.id, deps)).rejects.toThrow(DomainValidationError);
        expect(await findSummary(credential.id)).not.toHaveProperty("lastCheckedAt");
    });
});

function settlePendingWork(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}
