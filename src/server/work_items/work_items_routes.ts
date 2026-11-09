import { existsSync } from "node:fs";

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { createGhCliGitHubProvider } from "@/integrations/github/gh_cli_github_provider.js";
import { systemClock } from "@/lib/clock.js";
import type { AppDeps } from "@/server/app.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import { createCredentialService } from "@/server/credentials/credential_service.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import type { RouteModule } from "@/server/route_modules.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import { resolveGithubEnv } from "@/server/work_items/github_env.js";
import type { GithubEnvDeps } from "@/server/work_items/github_env.js";
import { syncGithubIssues } from "@/server/work_items/github_sync.js";
import type { GithubSyncOptions, SyncResult } from "@/server/work_items/github_sync.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import { createWorkItemService } from "@/server/work_items/work_item_service.js";
import type { WorkItemService } from "@/server/work_items/work_item_service.js";
import {
    listWorkItemsQuery,
    localItemInput,
    setManualColumnInput,
    updateLocalItemInput,
} from "@/shared/work_item_types.js";

const PROJECT_WORK_ITEMS_PATH = "/projects/:projectId/work-items";
const PROJECT_WORK_ITEMS_SYNC_PATH = `${PROJECT_WORK_ITEMS_PATH}/sync`;
const WORK_ITEM_PATH = "/work-items/:id";
const WORK_ITEM_COLUMN_PATH = `${WORK_ITEM_PATH}/column`;
const WORK_ITEM_ARCHIVE_PATH = `${WORK_ITEM_PATH}/archive`;
const HTTP_CREATED = 201;

const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const workItemParamsSchema = z.object({ id: z.string().min(1) });
const syncQuerySchema = z.object({ label: z.string().min(1).optional() });

type SyncProject = (projectId: string, opts?: GithubSyncOptions) => Promise<SyncResult>;

export const registerWorkItemsRoutes: RouteModule = (app, deps) => {
    const workItems = createWorkItemService({
        repo: new WorkItemRepository(deps.db),
        events: deps.events,
        clock: systemClock,
    });

    const syncProject = createProjectGithubSync(deps, workItems);

    registerProjectWorkItemsRoutes(app, workItems);
    registerSyncRoute(app, syncProject);
    registerWorkItemRoutes(app, workItems);
};

function createProjectGithubSync(deps: AppDeps, workItems: WorkItemService): SyncProject {
    const projects = createProjectService({
        repo: new ProjectRepository(deps.db),
        git: deps.git,
        fileExists: existsSync,
        clock: systemClock,
    });
    const githubEnvDeps = createGithubEnvDeps(deps);

    return async (projectId, opts) => {
        const env = await resolveGithubEnv(projectId, githubEnvDeps);
        const github = createGhCliGitHubProvider({ commands: deps.commands, env });
        const syncDeps = { projects, items: workItems, github, clock: systemClock };
        return syncGithubIssues(projectId, syncDeps, opts);
    };
}

function createGithubEnvDeps(deps: AppDeps): GithubEnvDeps {
    return {
        settings: createSettingsService({
            repo: new SettingsRepository(deps.db),
            lookups: createSettingsLookups(deps.db),
            clock: systemClock,
        }),
        credentials: createCredentialService({
            repo: new CredentialRepository(deps.db),
            secrets: deps.secrets,
            redactor: deps.redactor,
            clock: systemClock,
        }),
    };
}

function registerProjectWorkItemsRoutes(app: FastifyInstance, workItems: WorkItemService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(
        PROJECT_WORK_ITEMS_PATH,
        { schema: { params: projectParamsSchema, querystring: listWorkItemsQuery } },
        (request) => workItems.list(request.params.projectId, request.query),
    );

    typedApp.post(
        PROJECT_WORK_ITEMS_PATH,
        { schema: { params: projectParamsSchema, body: localItemInput } },
        async (request, reply) => {
            const item = await workItems.createLocal(request.params.projectId, request.body);
            return reply.code(HTTP_CREATED).send(item);
        },
    );
}

function registerSyncRoute(app: FastifyInstance, syncProject: SyncProject): void {
    app.withTypeProvider<ZodTypeProvider>().post(
        PROJECT_WORK_ITEMS_SYNC_PATH,
        { schema: { params: projectParamsSchema, querystring: syncQuerySchema } },
        (request) => syncProject(request.params.projectId, { label: request.query.label }),
    );
}

function registerWorkItemRoutes(app: FastifyInstance, workItems: WorkItemService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(WORK_ITEM_PATH, { schema: { params: workItemParamsSchema } }, (request) =>
        workItems.get(request.params.id),
    );

    typedApp.patch(
        WORK_ITEM_PATH,
        { schema: { params: workItemParamsSchema, body: updateLocalItemInput } },
        (request) => workItems.updateLocal(request.params.id, request.body),
    );

    typedApp.post(
        WORK_ITEM_COLUMN_PATH,
        { schema: { params: workItemParamsSchema, body: setManualColumnInput } },
        (request) => workItems.setManualColumn(request.params.id, request.body.column),
    );

    typedApp.post(WORK_ITEM_ARCHIVE_PATH, { schema: { params: workItemParamsSchema } }, (request) =>
        workItems.archive(request.params.id),
    );
}
