import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import type { StoredCredential } from "@/server/credentials/credential_repository.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import type { SettingsService } from "@/server/settings/settings_service.js";
import { READONLY_PRESET_ID } from "@/server/tool_profiles/tool_profile_presets.js";
import {
    DEFAULT_GLOBAL_SETTINGS,
    DEFAULT_PROJECT_SETTINGS,
    globalSettingsSchema,
    projectSettingsSchema,
} from "@/shared/settings_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";

const PROJECT_ID = "prj_forja";
const CREDENTIAL_ID = "cred_anthropic";
const SAVED_AT = new Date("2026-06-01T10:00:00Z");

const STORED_CREDENTIAL: StoredCredential = {
    id: CREDENTIAL_ID,
    name: "Anthropic pessoal",
    kind: "anthropic_api_key",
    envVar: "ANTHROPIC_API_KEY",
    sealedValue: "selado",
    masked: "sk-a…b2",
    createdAt: SAVED_AT.toISOString(),
    updatedAt: SAVED_AT.toISOString(),
};

describe("SettingsService", () => {
    let database: DatabaseHandle;
    let service: SettingsService;

    beforeEach(() => {
        database = createTestDb();
        new ProjectRepository(database.db).insert(buildProject({ id: PROJECT_ID }));
        new CredentialRepository(database.db).insert(STORED_CREDENTIAL);
        service = createSettingsService({
            repo: new SettingsRepository(database.db),
            lookups: createSettingsLookups(database.db),
            clock: new FakeClock(SAVED_AT),
        });
    });

    afterEach(() => {
        database.close();
    });

    describe("project settings", () => {
        it("returns the defaults when the project was never configured", async () => {
            const settings = await service.getProjectSettings(PROJECT_ID);

            expect(settings).toEqual(DEFAULT_PROJECT_SETTINGS);
            expect(settings).toMatchObject({
                defaultModel: "claude-opus-5-5",
                defaultEffort: "high",
                defaultToolProfileId: "tlp_builtin_default",
                agentImage: "forja-agent:latest",
                maxConcurrentAgents: 3,
            });
        });

        it("reads back the saved settings", async () => {
            const changed = projectSettingsSchema.parse({
                defaultCredentialId: CREDENTIAL_ID,
                githubCredentialId: CREDENTIAL_ID,
                defaultEffort: "max",
                defaultToolProfileId: READONLY_PRESET_ID,
                systemPrompt: "Responda em português.",
                dailyBudgetUsd: 12.5,
            });

            await service.saveProjectSettings(PROJECT_ID, changed);

            expect(await service.getProjectSettings(PROJECT_ID)).toEqual(changed);
        });

        it("replaces the settings saved before", async () => {
            const first = projectSettingsSchema.parse({ defaultEffort: "low" });
            const second = projectSettingsSchema.parse({ defaultModel: "claude-sonnet-5-5" });
            await service.saveProjectSettings(PROJECT_ID, first);

            await service.saveProjectSettings(PROJECT_ID, second);

            expect(await service.getProjectSettings(PROJECT_ID)).toEqual(second);
        });

        it("keeps each project's settings apart", async () => {
            new ProjectRepository(database.db).insert(buildProject({ id: "prj_outro" }));
            const changed = projectSettingsSchema.parse({ defaultEffort: "low" });

            await service.saveProjectSettings(PROJECT_ID, changed);

            expect(await service.getProjectSettings("prj_outro")).toEqual(DEFAULT_PROJECT_SETTINGS);
        });

        it("rejects reading the settings of an unknown project", async () => {
            await expect(service.getProjectSettings("prj_inexistente")).rejects.toThrow(
                NotFoundError,
            );
        });

        it("rejects saving the settings of an unknown project", async () => {
            await expect(
                service.saveProjectSettings("prj_inexistente", DEFAULT_PROJECT_SETTINGS),
            ).rejects.toThrow(NotFoundError);
        });

        it.each(["defaultCredentialId", "githubCredentialId"] as const)(
            "rejects an unknown credential in %s",
            async (field) => {
                const settings = { ...DEFAULT_PROJECT_SETTINGS, [field]: "cred_inexistente" };

                const saving = service.saveProjectSettings(PROJECT_ID, settings);

                await expect(saving).rejects.toThrow(DomainValidationError);
                await expect(saving).rejects.toMatchObject({ details: { field } });
            },
        );

        it("rejects an unknown tool profile", async () => {
            const settings = { ...DEFAULT_PROJECT_SETTINGS, defaultToolProfileId: "tlp_nenhum" };

            const saving = service.saveProjectSettings(PROJECT_ID, settings);

            await expect(saving).rejects.toMatchObject({
                name: "DomainValidationError",
                details: { field: "defaultToolProfileId" },
            });
        });

        it("keeps the previous settings when the new ones are rejected", async () => {
            const settings = { ...DEFAULT_PROJECT_SETTINGS, defaultCredentialId: "cred_nenhuma" };

            await service.saveProjectSettings(PROJECT_ID, settings).catch(() => undefined);

            expect(await service.getProjectSettings(PROJECT_ID)).toEqual(DEFAULT_PROJECT_SETTINGS);
        });
    });

    describe("global settings", () => {
        it("returns the defaults when nothing was saved", async () => {
            const settings = await service.getGlobalSettings();

            expect(settings).toEqual(DEFAULT_GLOBAL_SETTINGS);
            expect(settings).toMatchObject({
                maxConcurrentAgents: 3,
                minStartIntervalMs: 5_000,
                logRetentionDays: 30,
                logMaxTotalMb: 2_048,
            });
        });

        it("reads back the saved settings", async () => {
            const changed = globalSettingsSchema.parse({
                maxConcurrentAgents: 8,
                logRetentionDays: 7,
                modelPrices: {
                    "claude-opus-5-5": {
                        inputPerMTok: 5,
                        outputPerMTok: 25,
                        cacheReadPerMTok: 0.5,
                        cacheWritePerMTok: 6.25,
                    },
                },
            });

            await service.saveGlobalSettings(changed);
            await service.saveGlobalSettings(changed);

            expect(await service.getGlobalSettings()).toEqual(changed);
        });
    });
});
