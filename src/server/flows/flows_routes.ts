import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { existsSync } from "node:fs";

import { systemClock } from "@/lib/clock.js";
import type { AppDeps } from "@/server/app.js";
import { describeAttachment } from "@/server/attachment_header.js";
import { createAppFlowService } from "@/server/flows/app_flow_service.js";
import type { FlowService } from "@/server/flows/flow_service.js";
import { flowFileName, flowToYaml } from "@/server/flows/flow_yaml.js";
import { createSourcePreviewer } from "@/server/flows/source_preview.js";
import type { SourcePreviewer } from "@/server/flows/source_preview.js";
import {
    FLOW_TEMPLATES,
    findFlowTemplateOrThrow,
} from "@/server/flows/templates/flow_template_registry.js";
import type { FlowTemplate } from "@/server/flows/templates/flow_template_registry.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import type { RouteModule } from "@/server/route_modules.js";
import { createGithubOfProject } from "@/server/work_items/project_github_provider.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import { createWorkItemService } from "@/server/work_items/work_item_service.js";
import { sourcePreviewInput } from "@/shared/api_types.js";
import {
    createFlowFromTemplateInput,
    createFlowInput,
    exportFlowQuery,
    listFlowsQuery,
    publishFlowInput,
    renameFlowInput,
    saveFlowDraftInput,
} from "@/shared/flow_types.js";
import type { FlowTemplateSummary } from "@/shared/flow_types.js";

const PROJECT_FLOWS_PATH = "/projects/:projectId/flows";
const PROJECT_FLOWS_IMPORT_PATH = `${PROJECT_FLOWS_PATH}/import`;
const PROJECT_FLOWS_FROM_TEMPLATE_PATH = `${PROJECT_FLOWS_PATH}/from-template`;
const PROJECT_FLOW_SOURCE_PREVIEW_PATH = `${PROJECT_FLOWS_PATH}/:flowId/source-preview`;
const FLOW_TEMPLATES_PATH = "/flow-templates";
const FLOW_PATH = "/flows/:flowId";
const FLOW_ARCHIVE_PATH = `${FLOW_PATH}/archive`;
const FLOW_DEFAULT_PATH = `${FLOW_PATH}/default`;
const FLOW_DRAFT_PATH = `${FLOW_PATH}/draft`;
const FLOW_EXPORT_PATH = `${FLOW_PATH}/export`;
const FLOW_PUBLISH_PATH = `${FLOW_PATH}/publish`;
const FLOW_VERSIONS_PATH = `${FLOW_PATH}/versions`;
const FLOW_VERSION_PATH = `${FLOW_VERSIONS_PATH}/:version`;
const FLOW_VERSION_RESTORE_PATH = `${FLOW_VERSION_PATH}/restore`;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const YAML_CONTENT_TYPE = "application/yaml";
const YAML_BODY_CONTENT_TYPES = [YAML_CONTENT_TYPE, "text/yaml"];

const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const flowParamsSchema = z.object({ flowId: z.string().min(1) });
const projectFlowParamsSchema = projectParamsSchema.extend(flowParamsSchema.shape);
const versionParamsSchema = flowParamsSchema.extend({
    version: z.coerce.number().int().positive(),
});

export const registerFlowsRoutes: RouteModule = (app, deps) => {
    const flows = createAppFlowService({ db: deps.db, events: deps.events, clock: systemClock });

    registerProjectFlowsRoutes(app, flows);
    registerFlowRoutes(app, flows);
    registerDraftRoutes(app, flows);
    registerVersionRoutes(app, flows);
    registerYamlFileRoutes(app, flows);
    registerTemplateRoutes(app, flows);
    registerSourcePreviewRoute(app, createAppSourcePreviewer(deps));
};

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

function registerYamlFileRoutes(app: FastifyInstance, flows: FlowService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();
    app.addContentTypeParser(YAML_BODY_CONTENT_TYPES, { parseAs: "string" }, passTextBodyThrough);

    typedApp.get(
        FLOW_EXPORT_PATH,
        { schema: { params: flowParamsSchema, querystring: exportFlowQuery } },
        async (request, reply) => {
            const file = await flows.exportFlow(request.params.flowId, request.query.version);
            return reply
                .type(YAML_CONTENT_TYPE)
                .header("content-disposition", describeAttachment(flowFileName(file.name)))
                .send(flowToYaml(file));
        },
    );

    typedApp.post(
        PROJECT_FLOWS_IMPORT_PATH,
        { schema: { params: projectParamsSchema, body: z.string() } },
        async (request, reply) => {
            const flow = await flows.importFlow(request.params.projectId, request.body);
            return reply.code(HTTP_CREATED).send(flow);
        },
    );
}

function registerTemplateRoutes(app: FastifyInstance, flows: FlowService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(FLOW_TEMPLATES_PATH, () => FLOW_TEMPLATES.map(summarizeTemplate));

    typedApp.post(
        PROJECT_FLOWS_FROM_TEMPLATE_PATH,
        { schema: { params: projectParamsSchema, body: createFlowFromTemplateInput } },
        async (request, reply) => {
            const { templateId, name } = request.body;
            const template = findFlowTemplateOrThrow(templateId);
            const flow = await flows.create(request.params.projectId, {
                name,
                graph: template.build(),
            });
            return reply.code(HTTP_CREATED).send(flow);
        },
    );
}

function registerSourcePreviewRoute(app: FastifyInstance, previewer: SourcePreviewer): void {
    app.withTypeProvider<ZodTypeProvider>().post(
        PROJECT_FLOW_SOURCE_PREVIEW_PATH,
        { schema: { params: projectFlowParamsSchema, body: sourcePreviewInput } },
        (request) => previewer.previewSourceItems(request.params.projectId, request.body.config),
    );
}

function createAppSourcePreviewer(deps: AppDeps): SourcePreviewer {
    return createSourcePreviewer({
        projects: createProjectService({
            repo: new ProjectRepository(deps.db),
            git: deps.git,
            fileExists: existsSync,
            clock: systemClock,
        }),
        workItems: createWorkItemService({
            repo: new WorkItemRepository(deps.db),
            events: deps.events,
            clock: systemClock,
        }),
        githubOf: createGithubOfProject({ ...deps, clock: systemClock }),
    });
}

function summarizeTemplate(template: FlowTemplate): FlowTemplateSummary {
    return { id: template.id, name: template.name, description: template.description };
}

function passTextBodyThrough(
    _request: unknown,
    body: string,
    done: (error: null, body: string) => void,
): void {
    done(null, body);
}
