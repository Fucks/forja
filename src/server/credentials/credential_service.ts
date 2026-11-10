import type { SecretBox } from "@/integrations/secrets/secret_box.js";
import { maskSecret } from "@/integrations/secrets/secret_redactor.js";
import type { SecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import type {
    CredentialRepository,
    StoredCredential,
} from "@/server/credentials/credential_repository.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import { ENV_VAR_BY_KIND, GENERIC_ENV_VAR_REQUIRED_MESSAGE } from "@/shared/credential_types.js";
import type {
    CredentialInput,
    CredentialKind,
    CredentialSummary,
} from "@/shared/credential_types.js";

type LastCheck = Pick<CredentialSummary, "lastCheckedAt" | "lastCheckOk">;

export interface RuntimeCredential {
    kind: CredentialKind;
    envVar: string;
    value: string;
}

export interface CredentialService {
    /** @throws DomainValidationError when a generic_env credential has no envVar */
    create(input: CredentialInput): Promise<CredentialSummary>;
    /** In creation order. */
    list(): Promise<CredentialSummary[]>;
    /** @throws NotFoundError */
    rename(id: string, name: string): Promise<CredentialSummary>;
    /** @throws NotFoundError */
    replaceValue(id: string, value: string): Promise<CredentialSummary>;
    /** @throws NotFoundError */
    remove(id: string): Promise<void>;
    /** Internal use only (agent workspaces); no route exposes it. @throws NotFoundError */
    revealForRuntime(id: string): Promise<RuntimeCredential>;
    /** @throws NotFoundError */
    recordCheck(id: string, ok: boolean, at: Date): Promise<void>;
}

export interface CredentialServiceDeps {
    repo: CredentialRepository;
    secrets: SecretBox;
    redactor: SecretRedactor;
    clock: Clock;
}

type ValueProtectionDeps = Pick<CredentialServiceDeps, "secrets" | "redactor">;

export function createCredentialService(deps: CredentialServiceDeps): CredentialService {
    return {
        create: (input) => resolveWith(() => createCredential(deps, input)),
        list: () => resolveWith(() => deps.repo.list().map(toCredentialSummary)),
        rename: (id, name) => resolveWith(() => renameCredential(deps, id, name)),
        replaceValue: (id, value) => resolveWith(() => replaceCredentialValue(deps, id, value)),
        remove: (id) => resolveWith(() => removeCredential(deps.repo, id)),
        revealForRuntime: (id) => resolveWith(() => revealCredential(deps, id)),
        recordCheck: (id, ok, at) =>
            resolveWith(() => recordCredentialCheck(deps.repo, id, ok, at)),
    };
}

/** Run on boot so values stored in earlier sessions are masked in logs too. */
export function registerStoredCredentialValues(
    deps: ValueProtectionDeps & Pick<CredentialServiceDeps, "repo">,
): void {
    for (const credential of deps.repo.list()) {
        deps.redactor.register(deps.secrets.open(credential.sealedValue));
    }
}

function createCredential(deps: CredentialServiceDeps, input: CredentialInput): CredentialSummary {
    const createdAt = deps.clock.now().toISOString();
    const credential: StoredCredential = {
        id: newId("cred"),
        name: input.name,
        kind: input.kind,
        envVar: resolveEnvVar(input),
        ...protectValue(deps, input.value),
        createdAt,
        updatedAt: createdAt,
    };
    deps.repo.insert(credential);

    return toCredentialSummary(credential);
}

function renameCredential(
    deps: CredentialServiceDeps,
    id: string,
    name: string,
): CredentialSummary {
    const credential = findCredentialOrThrow(deps.repo, id);

    return saveChangedCredential(deps, { ...credential, name });
}

function replaceCredentialValue(
    deps: CredentialServiceDeps,
    id: string,
    value: string,
): CredentialSummary {
    const credential = findCredentialOrThrow(deps.repo, id);

    return saveChangedCredential(deps, { ...credential, ...protectValue(deps, value) });
}

function saveChangedCredential(
    deps: CredentialServiceDeps,
    credential: StoredCredential,
): CredentialSummary {
    const updated = { ...credential, updatedAt: deps.clock.now().toISOString() };
    deps.repo.update(updated);

    return toCredentialSummary(updated);
}

function removeCredential(repo: CredentialRepository, id: string): void {
    findCredentialOrThrow(repo, id);
    repo.delete(id);
}

function revealCredential(deps: CredentialServiceDeps, id: string): RuntimeCredential {
    const credential = findCredentialOrThrow(deps.repo, id);

    return {
        kind: credential.kind,
        envVar: credential.envVar,
        value: deps.secrets.open(credential.sealedValue),
    };
}

function recordCredentialCheck(
    repo: CredentialRepository,
    id: string,
    ok: boolean,
    at: Date,
): void {
    const credential = findCredentialOrThrow(repo, id);
    repo.update({ ...credential, lastCheckedAt: at.toISOString(), lastCheckOk: ok });
}

function findCredentialOrThrow(repo: CredentialRepository, id: string): StoredCredential {
    const credential = repo.findById(id);
    if (!credential) {
        throw new NotFoundError(`Credencial ${id} não encontrada.`);
    }

    return credential;
}

function resolveEnvVar(input: CredentialInput): string {
    if (input.kind !== "generic_env") {
        return ENV_VAR_BY_KIND[input.kind];
    }
    if (input.envVar === undefined) {
        throw new DomainValidationError(GENERIC_ENV_VAR_REQUIRED_MESSAGE, {
            field: "envVar",
        });
    }

    return input.envVar;
}

function protectValue(
    deps: ValueProtectionDeps,
    value: string,
): Pick<StoredCredential, "sealedValue" | "masked"> {
    deps.redactor.register(value);

    return { sealedValue: deps.secrets.seal(value), masked: maskSecret(value) };
}

function toCredentialSummary(credential: StoredCredential): CredentialSummary {
    return {
        id: credential.id,
        name: credential.name,
        kind: credential.kind,
        masked: credential.masked,
        envVar: credential.envVar,
        ...pickLastCheck(credential),
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
    };
}

function pickLastCheck({ lastCheckedAt, lastCheckOk }: StoredCredential): LastCheck {
    if (lastCheckedAt === undefined || lastCheckOk === undefined) {
        return {};
    }

    return { lastCheckedAt, lastCheckOk };
}
