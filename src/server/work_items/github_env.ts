import type { CredentialService } from "@/server/credentials/credential_service.js";
import type { SettingsService } from "@/server/settings/settings_service.js";

export interface GithubEnvDeps {
    settings: SettingsService;
    credentials: CredentialService;
}

/** The environment for `gh` on behalf of the project; empty means the host's own `gh` login. */
export async function resolveGithubEnv(
    projectId: string,
    deps: GithubEnvDeps,
): Promise<Record<string, string>> {
    const { githubCredentialId } = await deps.settings.getProjectSettings(projectId);
    if (githubCredentialId === null) {
        return {};
    }

    const credential = await deps.credentials.revealForRuntime(githubCredentialId);
    return { [credential.envVar]: credential.value };
}
