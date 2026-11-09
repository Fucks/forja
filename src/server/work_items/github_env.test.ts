import { createSecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import { createCredentialService } from "@/server/credentials/credential_service.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import { resolveGithubEnv } from "@/server/work_items/github_env.js";
import type { GithubEnvDeps } from "@/server/work_items/github_env.js";
import { DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";
import { createTestSecretBox } from "@/test/test_secrets.js";

const PROJECT_ID = "prj_forja";

describe("resolveGithubEnv", () => {
    let database: DatabaseHandle;
    let deps: GithubEnvDeps;

    beforeEach(() => {
        database = createTestDb();
        new ProjectRepository(database.db).insert(buildProject({ id: PROJECT_ID }));
        const clock = new FakeClock();
        deps = {
            settings: createSettingsService({
                repo: new SettingsRepository(database.db),
                lookups: createSettingsLookups(database.db),
                clock,
            }),
            credentials: createCredentialService({
                repo: new CredentialRepository(database.db),
                secrets: createTestSecretBox(),
                redactor: createSecretRedactor(),
                clock,
            }),
        };
    });

    afterEach(() => {
        database.close();
    });

    it("passes the GitHub credential of the project as GH_TOKEN", async () => {
        const credential = await deps.credentials.create({
            name: "GitHub",
            kind: "github_token",
            value: "ghp_segredo",
        });
        await deps.settings.saveProjectSettings(PROJECT_ID, {
            ...DEFAULT_PROJECT_SETTINGS,
            githubCredentialId: credential.id,
        });

        const env = await resolveGithubEnv(PROJECT_ID, deps);

        expect(env).toEqual({ GH_TOKEN: "ghp_segredo" });
    });

    it("adds nothing so the authenticated gh of the host is used without a credential", async () => {
        const env = await resolveGithubEnv(PROJECT_ID, deps);

        expect(env).toEqual({});
    });
});
