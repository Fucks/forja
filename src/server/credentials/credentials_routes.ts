import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import {
    createCredentialService,
    registerStoredCredentialValues,
} from "@/server/credentials/credential_service.js";
import type { CredentialService } from "@/server/credentials/credential_service.js";
import type { RouteModule } from "@/server/route_modules.js";
import { credentialInput, updateCredentialInput } from "@/shared/credential_types.js";
import type { CredentialSummary, UpdateCredentialInput } from "@/shared/credential_types.js";

const CREDENTIALS_PATH = "/credentials";
const CREDENTIAL_BY_ID_PATH = "/credentials/:id";
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
