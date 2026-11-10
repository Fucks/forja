import { createGhCliGitHubProvider } from "@/integrations/github/gh_cli_github_provider.js";
import type { GitHubProvider } from "@/integrations/github/github_provider.js";
import type { CommandRunner } from "@/integrations/process/command_runner.js";
import type { SecretBox } from "@/integrations/secrets/secret_box.js";
import type { SecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import type { Clock } from "@/lib/clock.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import { createCredentialService } from "@/server/credentials/credential_service.js";
import type { ForjaDb } from "@/server/db/client.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import { type GithubEnvDeps, resolveGithubEnv } from "@/server/work_items/github_env.js";

/** A `gh` provider authenticated with the GitHub credential of the project. */
export type GithubOfProject = (projectId: string) => Promise<GitHubProvider>;

export interface GithubOfProjectDeps {
    db: ForjaDb;
    commands: CommandRunner;
    secrets: SecretBox;
    redactor: SecretRedactor;
    clock: Clock;
}

export function createGithubOfProject(deps: GithubOfProjectDeps): GithubOfProject {
    const githubEnvDeps = createGithubEnvDeps(deps);

    return async (projectId) => {
        const env = await resolveGithubEnv(projectId, githubEnvDeps);
        return createGhCliGitHubProvider({ commands: deps.commands, env });
    };
}

function createGithubEnvDeps(deps: GithubOfProjectDeps): GithubEnvDeps {
    return {
        settings: createSettingsService({
            repo: new SettingsRepository(deps.db),
            lookups: createSettingsLookups(deps.db),
            clock: deps.clock,
        }),
        credentials: createCredentialService({
            repo: new CredentialRepository(deps.db),
            secrets: deps.secrets,
            redactor: deps.redactor,
            clock: deps.clock,
        }),
    };
}
