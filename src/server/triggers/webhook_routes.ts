import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { ForbiddenError } from "@/server/errors.js";
import type { RouteModule } from "@/server/route_modules.js";
import type { TriggerFiringDeps } from "@/server/triggers/trigger_firing.js";
import { createTriggerFiringDeps } from "@/server/triggers/triggers_routes.js";
import { fireWebhookTrigger } from "@/server/triggers/trigger_service.js";
import { fireTriggerInput } from "@/shared/trigger_types.js";

const WEBHOOK_PATH = "/hooks/:triggerId";
const TOKEN_HEADER = "x-forja-token";
const HTTP_ACCEPTED = 202;
const LOOPBACK_ADDRESSES: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const OUTSIDE_LOCALHOST_MESSAGE = "O webhook só aceita chamadas da própria máquina.";

const webhookParamsSchema = z.object({ triggerId: z.string().min(1) });
const webhookHeadersSchema = z.object({ [TOKEN_HEADER]: z.string().optional() });
// Fastify hands a request without a body to the schema as null.
const webhookBodySchema = fireTriggerInput.nullish();

export const registerWebhookRoutes: RouteModule = (app, deps) => {
    rejectCallsFromOutsideLocalhost(app);
    registerWebhookFireRoute(app, createTriggerFiringDeps(deps));
};

// Checked before anything else, so a caller from the network learns nothing about the triggers.
function rejectCallsFromOutsideLocalhost(app: FastifyInstance): void {
    app.addHook("onRequest", (request, _reply, done) => {
        if (!LOOPBACK_ADDRESSES.has(request.ip)) {
            done(new ForbiddenError(OUTSIDE_LOCALHOST_MESSAGE));
            return;
        }
        done();
    });
}

function registerWebhookFireRoute(app: FastifyInstance, firingDeps: TriggerFiringDeps): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post(
        WEBHOOK_PATH,
        {
            schema: {
                params: webhookParamsSchema,
                headers: webhookHeadersSchema,
                body: webhookBodySchema,
            },
        },
        async (request, reply) => {
            const fire = await fireWebhookTrigger(firingDeps, request.params.triggerId, {
                token: request.headers[TOKEN_HEADER],
                itemIds: request.body?.itemIds,
            });
            return reply.code(HTTP_ACCEPTED).send(fire);
        },
    );
}
