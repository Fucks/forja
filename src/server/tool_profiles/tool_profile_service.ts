import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import { ConflictError, DomainValidationError, NotFoundError } from "@/server/errors.js";
import {
    TOOL_PROFILE_PRESETS,
    findPresetById,
} from "@/server/tool_profiles/tool_profile_presets.js";
import type { ToolProfileRepository } from "@/server/tool_profiles/tool_profile_repository.js";
import { TOOL_PROFILE_NAME_MAX_LENGTH } from "@/shared/tool_profile_types.js";
import type { McpServer, ToolProfile, ToolProfileInput } from "@/shared/tool_profile_types.js";

const COPY_NAME_SUFFIX = " (cópia)";
const CREDENTIAL_REFERENCE_START = "${cred:";
const WELL_FORMED_CREDENTIAL_REFERENCE = /\$\{cred:cred_[0-9A-Za-z]+\}/g;

export interface ToolProfileService {
    /** Builtin presets first, then the user's profiles in creation order. */
    list(): Promise<ToolProfile[]>;
    /** @throws NotFoundError */
    get(id: string): Promise<ToolProfile>;
    /** @throws DomainValidationError */
    create(input: ToolProfileInput): Promise<ToolProfile>;
    /** @throws NotFoundError, ConflictError for a preset, DomainValidationError */
    update(id: string, input: ToolProfileInput): Promise<ToolProfile>;
    /** @throws NotFoundError, ConflictError for a preset */
    remove(id: string): Promise<void>;
    /** Copies any profile, presets included, into a new editable one. */
    duplicate(id: string): Promise<ToolProfile>;
}

export interface ToolProfileServiceDeps {
    repo: ToolProfileRepository;
    clock: Clock;
}

export function createToolProfileService(deps: ToolProfileServiceDeps): ToolProfileService {
    return {
        list: () => resolveWith(() => [...TOOL_PROFILE_PRESETS, ...deps.repo.list()]),
        get: (id) => resolveWith(() => findToolProfileOrThrow(deps.repo, id)),
        create: (input) => resolveWith(() => createToolProfile(deps, input)),
        update: (id, input) => resolveWith(() => updateToolProfile(deps, id, input)),
        remove: (id) => resolveWith(() => removeToolProfile(deps.repo, id)),
        duplicate: (id) => resolveWith(() => duplicateToolProfile(deps, id)),
    };
}

function findToolProfileOrThrow(repo: ToolProfileRepository, id: string): ToolProfile {
    const profile = findPresetById(id) ?? repo.findById(id);
    if (!profile) {
        throw new NotFoundError(`Perfil de ferramentas ${id} não encontrado.`);
    }

    return profile;
}

function createToolProfile(deps: ToolProfileServiceDeps, input: ToolProfileInput): ToolProfile {
    assertMcpServersAreValid(input.mcpServers);

    return insertNewToolProfile(deps, input);
}

function insertNewToolProfile(deps: ToolProfileServiceDeps, input: ToolProfileInput): ToolProfile {
    const createdAt = deps.clock.now().toISOString();
    const profile: ToolProfile = {
        ...input,
        id: newId("tlp"),
        builtin: false,
        createdAt,
        updatedAt: createdAt,
    };
    deps.repo.insert(profile);

    return profile;
}

function updateToolProfile(
    deps: ToolProfileServiceDeps,
    id: string,
    input: ToolProfileInput,
): ToolProfile {
    const current = findEditableToolProfileOrThrow(deps.repo, id);
    assertMcpServersAreValid(input.mcpServers);

    const updated: ToolProfile = {
        ...input,
        id,
        builtin: false,
        createdAt: current.createdAt,
        updatedAt: deps.clock.now().toISOString(),
    };
    deps.repo.update(updated);

    return updated;
}

function removeToolProfile(repo: ToolProfileRepository, id: string): void {
    findEditableToolProfileOrThrow(repo, id);
    repo.delete(id);
}

function duplicateToolProfile(deps: ToolProfileServiceDeps, id: string): ToolProfile {
    const original = toToolProfileInput(findToolProfileOrThrow(deps.repo, id));

    return insertNewToolProfile(deps, { ...original, name: buildCopyName(original.name) });
}

function toToolProfileInput(profile: ToolProfile): ToolProfileInput {
    return {
        name: profile.name,
        description: profile.description,
        mcpServers: profile.mcpServers,
        allowedTools: profile.allowedTools,
        disallowedTools: profile.disallowedTools,
        permissionMode: profile.permissionMode,
        indexCodegraphOnStart: profile.indexCodegraphOnStart,
    };
}

function findEditableToolProfileOrThrow(repo: ToolProfileRepository, id: string): ToolProfile {
    const profile = findToolProfileOrThrow(repo, id);
    if (profile.builtin) {
        throw new ConflictError(
            `O perfil ${profile.name} é embutido e não pode ser alterado; duplique-o para editar.`,
        );
    }

    return profile;
}

function buildCopyName(name: string): string {
    const maxBaseLength = TOOL_PROFILE_NAME_MAX_LENGTH - COPY_NAME_SUFFIX.length;
    return `${name.slice(0, maxBaseLength)}${COPY_NAME_SUFFIX}`;
}

function assertMcpServersAreValid(mcpServers: McpServer[]): void {
    assertMcpServerNamesAreUnique(mcpServers);
    mcpServers.forEach(assertCredentialReferencesAreWellFormed);
}

function assertMcpServerNamesAreUnique(mcpServers: McpServer[]): void {
    const seenNames = new Set<string>();
    for (const { name } of mcpServers) {
        if (seenNames.has(name)) {
            throw new DomainValidationError(`O MCP ${name} aparece mais de uma vez no perfil.`, {
                mcpServer: name,
            });
        }
        seenNames.add(name);
    }
}

// Credentials are not resolved here (#61 does it in the workspace), so only the format is checked.
function assertCredentialReferencesAreWellFormed(mcpServer: McpServer): void {
    for (const [variable, envValue] of Object.entries(mcpServer.env)) {
        if (hasMalformedCredentialReference(envValue)) {
            throw new DomainValidationError(
                `A variável ${variable} do MCP ${mcpServer.name} tem uma referência de credencial inválida; use \${cred:<id>}.`,
                { mcpServer: mcpServer.name, variable },
            );
        }
    }
}

function hasMalformedCredentialReference(envValue: string): boolean {
    const withoutWellFormedReferences = envValue.replace(WELL_FORMED_CREDENTIAL_REFERENCE, "");
    return withoutWellFormedReferences.includes(CREDENTIAL_REFERENCE_START);
}
