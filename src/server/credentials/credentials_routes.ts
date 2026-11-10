import path from "node:path";

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import {
    checkCredential,
    type CredentialCheckDeps,
} from "@/server/credentials/credential_check.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import {
    createCredentialService,
    registerStoredCredentialValues,
} from "@/server/credentials/credential_service.js";
import type { CredentialService } from "@/server/credentials/credential_service.js";
import type { RouteModule } from "@/server/route_modules.js";
import { credentialInput, updateCredentialInput } from "@/shared/credential_types.js";
import type { CredentialSummary, UpdateCredentialInput } from "@/shared/credential_types.js";
import { DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";

const CREDENTIALS_PATH = "/credentials";
const CREDENTIAL_BY_ID_PATH = "/credentials/:id";
const CREDENTIAL_CHECK_PATH = `${CREDENTIAL_BY_ID_PATH}/check`;
// Mounted as the repository of the Claude check; the agent needs none.
const CREDENTIAL_CHECK_DIR_NAME = "credential-check";
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

const credentialParamsSchema = z.object({ id: z.string().min(1) });

export const registerCredentialsRoutes: RouteModule = (app, deps) => {
    const repo = new CredentialRepository(deps.db);
    registerStoredCredentialValues({ repo, secrets: deps.secrets, redactor: deps.redactor });
    const credentials = createCredentialService({
        repo,
        secrets: deps.secrets,
        redactor: deps.redactor,
        clock: systemClock,
    });

    registerCollectionRoutes(app, credentials);
    registerCredentialRoutes(app, credentials);
    registerCheckRoute(app, {
        credentials,
        runtime: deps.agentRuntime,
        commands: deps.commands,
        clock: systemClock,
        sandbox: {
            repoPath: path.join(deps.paths.tmp, CREDENTIAL_CHECK_DIR_NAME),
            image: DEFAULT_PROJECT_SETTINGS.agentImage,
        },
    });
};

function registerCollectionRoutes(app: FastifyInstance, credentials: CredentialService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(CREDENTIALS_PATH, () => credentials.list());

    typedApp.post(
        CREDENTIALS_PATH,
        { schema: { body: credentialInput } },
        async (request, reply) => {
            const credential = await credentials.create(request.body);
            return reply.code(HTTP_CREATED).send(credential);
        },
    );
}

function registerCredentialRoutes(app: FastifyInstance, credentials: CredentialService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.patch(
        CREDENTIAL_BY_ID_PATH,
        { schema: { params: credentialParamsSchema, body: updateCredentialInput } },
        (request) => applyCredentialChanges(credentials, request.params.id, request.body),
    );

    typedApp.delete(
        CREDENTIAL_BY_ID_PATH,
        { schema: { params: credentialParamsSchema } },
        async (request, reply) => {
            await credentials.remove(request.params.id);
            return reply.code(HTTP_NO_CONTENT).send();
        },
    );
}

function registerCheckRoute(app: FastifyInstance, checkDeps: CredentialCheckDeps): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post(
        CREDENTIAL_CHECK_PATH,
        { schema: { params: credentialParamsSchema } },
        (request) => checkCredential(request.params.id, checkDeps),
    );
}

async function applyCredentialChanges(
    credentials: CredentialService,
    id: string,
    changes: UpdateCredentialInput,
): Promise<CredentialSummary> {
    if (!("name" in changes)) {
        return credentials.replaceValue(id, changes.value);
    }

    const renamed = await credentials.rename(id, changes.name);
    if (changes.value === undefined) {
        return renamed;
    }

    return credentials.replaceValue(id, changes.value);
}
