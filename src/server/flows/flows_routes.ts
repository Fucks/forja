import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { ValidationContext } from "@/engine/graph_validation.js";
import { systemClock } from "@/lib/clock.js";
import { FlowRepository } from "@/server/flows/flow_repository.js";
import { createFlowService } from "@/server/flows/flow_service.js";
import type { FlowService } from "@/server/flows/flow_service.js";
import type { RouteModule } from "@/server/route_modules.js";
import {
    createFlowInput,
    listFlowsQuery,
    publishFlowInput,
    renameFlowInput,
    saveFlowDraftInput,
} from "@/shared/flow_types.js";

const PROJECT_FLOWS_PATH = "/projects/:projectId/flows";
const FLOW_PATH = "/flows/:flowId";
const FLOW_ARCHIVE_PATH = `${FLOW_PATH}/archive`;
const FLOW_DEFAULT_PATH = `${FLOW_PATH}/default`;
const FLOW_DRAFT_PATH = `${FLOW_PATH}/draft`;
const FLOW_PUBLISH_PATH = `${FLOW_PATH}/publish`;
const FLOW_VERSIONS_PATH = `${FLOW_PATH}/versions`;
const FLOW_VERSION_PATH = `${FLOW_VERSIONS_PATH}/:version`;
const FLOW_VERSION_RESTORE_PATH = `${FLOW_VERSION_PATH}/restore`;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const flowParamsSchema = z.object({ flowId: z.string().min(1) });
const versionParamsSchema = flowParamsSchema.extend({
    version: z.coerce.number().int().positive(),
});

export const registerFlowsRoutes: RouteModule = (app, deps) => {
    const flows = createFlowService({
        repo: new FlowRepository(deps.db),
        events: deps.events,
        clock: systemClock,
        validationContext: buildValidationContext,
    });

    registerProjectFlowsRoutes(app, flows);
    registerFlowRoutes(app, flows);
    registerDraftRoutes(app, flows);
    registerVersionRoutes(app, flows);
};

// TODO(#20): add the ids of the existing credentials as knownCredentialIds.
// TODO(#23): add the ids of the existing tool profiles as knownToolProfileIds.
function buildValidationContext(): Promise<ValidationContext> {
    return Promise.resolve({});
}

function registerProjectFlowsRoutes(app: FastifyInstance, flows: FlowService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(
        PROJECT_FLOWS_PATH,
        { schema: { params: projectParamsSchema, querystring: listFlowsQuery } },
        (request) => flows.list(request.params.projectId, request.query),
    );

    typedApp.post(
        PROJECT_FLOWS_PATH,
        { schema: { params: projectParamsSchema, body: createFlowInput } },
        async (request, reply) => {
            const flow = await flows.create(request.params.projectId, request.body);
            return reply.code(HTTP_CREATED).send(flow);
        },
    );
}

function registerFlowRoutes(app: FastifyInstance, flows: FlowService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.patch(
        FLOW_PATH,
        { schema: { params: flowParamsSchema, body: renameFlowInput } },
        (request) => flows.rename(request.params.flowId, request.body.name),
    );

    typedApp.post(
        FLOW_ARCHIVE_PATH,
        { schema: { params: flowParamsSchema } },
        async (request, reply) => {
            await flows.archive(request.params.flowId);
            return reply.code(HTTP_NO_CONTENT).send();
        },
    );

    typedApp.post(
        FLOW_DEFAULT_PATH,
        { schema: { params: flowParamsSchema } },
        async (request, reply) => {
            await flows.setDefault(request.params.flowId);
            return reply.code(HTTP_NO_CONTENT).send();
        },
    );
}

function registerDraftRoutes(app: FastifyInstance, flows: FlowService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(FLOW_DRAFT_PATH, { schema: { params: flowParamsSchema } }, (request) =>
        flows.getDraft(request.params.flowId),
    );

    typedApp.put(
        FLOW_DRAFT_PATH,
        { schema: { params: flowParamsSchema, body: saveFlowDraftInput } },
        (request) => {
            const { graph, expectedRevision } = request.body;
            return flows.saveDraft(request.params.flowId, graph, expectedRevision);
        },
    );
}

function registerVersionRoutes(app: FastifyInstance, flows: FlowService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post(
        FLOW_PUBLISH_PATH,
        { schema: { params: flowParamsSchema, body: publishFlowInput } },
        async (request, reply) => {
            const version = await flows.publish(request.params.flowId, request.body?.note);
            return reply.code(HTTP_CREATED).send(version);
        },
    );

    typedApp.get(FLOW_VERSIONS_PATH, { schema: { params: flowParamsSchema } }, (request) =>
        flows.listVersions(request.params.flowId),
    );

    typedApp.get(FLOW_VERSION_PATH, { schema: { params: versionParamsSchema } }, (request) =>
        flows.getVersion(request.params.flowId, request.params.version),
    );

    typedApp.post(
        FLOW_VERSION_RESTORE_PATH,
        { schema: { params: versionParamsSchema } },
        (request) => flows.restoreVersionToDraft(request.params.flowId, request.params.version),
    );
}
