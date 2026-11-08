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
import { DomainValidationError } from "@/server/errors.js";
import { ENV_VAR_BY_KIND } from "@/shared/credential_types.js";
import type { CredentialInput, CredentialSummary } from "@/shared/credential_types.js";

type LastCheck = Pick<CredentialSummary, "lastCheckedAt" | "lastCheckOk">;

export interface CredentialService {
    create(input: CredentialInput): Promise<CredentialSummary>;
}

export interface CredentialServiceDeps {
    repo: CredentialRepository;
    secrets: SecretBox;
    redactor: SecretRedactor;
    clock: Clock;
}

export function createCredentialService(deps: CredentialServiceDeps): CredentialService {
    return {
        create: (input) => resolveWith(() => createCredential(deps, input)),
    };
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

function resolveEnvVar(input: CredentialInput): string {
    if (input.kind !== "generic_env") {
        return ENV_VAR_BY_KIND[input.kind];
    }
    if (input.envVar === undefined) {
        throw new DomainValidationError("Informe a variável de ambiente da credencial genérica.", {
            field: "envVar",
        });
    }

    return input.envVar;
}

function protectValue(
    deps: CredentialServiceDeps,
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
