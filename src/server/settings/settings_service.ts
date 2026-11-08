import type { Clock } from "@/lib/clock.js";
import { resolveWith } from "@/lib/resolve_with.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import type { SettingsLookups } from "@/server/settings/settings_lookups.js";
import type { SettingsRepository } from "@/server/settings/settings_repository.js";
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import type { GlobalSettings, ProjectSettings } from "@/shared/settings_types.js";

type CredentialField = "defaultCredentialId" | "githubCredentialId";

const CREDENTIAL_FIELDS: readonly CredentialField[] = ["defaultCredentialId", "githubCredentialId"];

export interface SettingsService {
    /** The defaults when the project was never configured. @throws NotFoundError */
    getProjectSettings(projectId: string): Promise<ProjectSettings>;
    /** @throws NotFoundError, DomainValidationError for an unknown credential or tool profile */
    saveProjectSettings(projectId: string, settings: ProjectSettings): Promise<ProjectSettings>;
    /** The defaults when nothing was saved. */
    getGlobalSettings(): Promise<GlobalSettings>;
    saveGlobalSettings(settings: GlobalSettings): Promise<GlobalSettings>;
}

export interface SettingsServiceDeps {
    repo: SettingsRepository;
    lookups: SettingsLookups;
    clock: Clock;
}

export function createSettingsService(deps: SettingsServiceDeps): SettingsService {
    return {
        getProjectSettings: (projectId) => resolveWith(() => readProjectSettings(deps, projectId)),
        saveProjectSettings: (projectId, settings) =>
            resolveWith(() => writeProjectSettings(deps, projectId, settings)),
        getGlobalSettings: () =>
            resolveWith(() => deps.repo.findGlobalSettings() ?? DEFAULT_GLOBAL_SETTINGS),
        saveGlobalSettings: (settings) => resolveWith(() => writeGlobalSettings(deps, settings)),
    };
}

function readProjectSettings(deps: SettingsServiceDeps, projectId: string): ProjectSettings {
    assertProjectExists(deps.lookups, projectId);

    return deps.repo.findProjectSettings(projectId) ?? DEFAULT_PROJECT_SETTINGS;
}

function writeProjectSettings(
    deps: SettingsServiceDeps,
    projectId: string,
    settings: ProjectSettings,
): ProjectSettings {
    assertProjectExists(deps.lookups, projectId);
    assertReferencesExist(deps.lookups, settings);
    deps.repo.saveProjectSettings(projectId, settings, deps.clock.now().toISOString());

    return settings;
}

function writeGlobalSettings(deps: SettingsServiceDeps, settings: GlobalSettings): GlobalSettings {
    deps.repo.saveGlobalSettings(settings, deps.clock.now().toISOString());

    return settings;
}

function assertProjectExists(lookups: SettingsLookups, projectId: string): void {
    if (!lookups.projectExists(projectId)) {
        throw new NotFoundError(`Projeto ${projectId} não encontrado.`);
    }
}

function assertReferencesExist(lookups: SettingsLookups, settings: ProjectSettings): void {
    CREDENTIAL_FIELDS.forEach((field) => assertCredentialExists(lookups, settings, field));

    if (!lookups.toolProfileExists(settings.defaultToolProfileId)) {
        throw new DomainValidationError(
            `O perfil de ferramentas ${settings.defaultToolProfileId} não existe.`,
            { field: "defaultToolProfileId" },
        );
    }
}

function assertCredentialExists(
    lookups: SettingsLookups,
    settings: ProjectSettings,
    field: CredentialField,
): void {
    const credentialId = settings[field];
    if (credentialId === null || lookups.credentialExists(credentialId)) {
        return;
    }

    throw new DomainValidationError(`A credencial ${credentialId} não existe.`, { field });
}
