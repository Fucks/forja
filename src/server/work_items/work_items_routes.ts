import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import type { AppDeps } from "@/server/app.js";
import { createAppFlowService } from "@/server/flows/app_flow_service.js";
import type { RouteModule } from "@/server/route_modules.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import { createAppUsageService } from "@/server/usage/app_usage_service.js";
import { createBoardService } from "@/server/work_items/board_service.js";
import type { BoardService } from "@/server/work_items/board_service.js";
import { createProjectGithubSync } from "@/server/work_items/project_github_sync.js";
import type { SyncProject } from "@/server/work_items/project_github_sync.js";
import type { SyncScheduler } from "@/server/work_items/sync_scheduler.js";
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
const PROJECT_BOARD_PATH = "/projects/:projectId/board";
const WORK_ITEM_PATH = "/work-items/:id";
const WORK_ITEM_COLUMN_PATH = `${WORK_ITEM_PATH}/column`;
const WORK_ITEM_ARCHIVE_PATH = `${WORK_ITEM_PATH}/archive`;
const HTTP_CREATED = 201;

const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const workItemParamsSchema = z.object({ id: z.string().min(1) });
const syncQuerySchema = z.object({ label: z.string().min(1).optional() });

export const registerWorkItemsRoutes: RouteModule = (app, deps) => {
    const workItems = createWorkItemService({
        repo: new WorkItemRepository(deps.db),
        events: deps.events,
        clock: systemClock,
    });

    const githubSync = createProjectGithubSync({ appDeps: deps, workItems, log: app.log });

    registerProjectWorkItemsRoutes(app, workItems);
    registerSyncRoute(app, githubSync.syncProject);
    registerBoardRoute(app, createAppBoardService(deps, workItems));
    registerWorkItemRoutes(app, workItems);
    runWhileAppIsUp(app, githubSync.scheduler);
};

function runWhileAppIsUp(app: FastifyInstance, scheduler: SyncScheduler): void {
    app.addHook("onReady", (done) => {
        scheduler.start();
        done();
    });
    app.addHook("onClose", (_closingApp, done) => {
        scheduler.stop();
        done();
    });
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

function createAppBoardService(deps: AppDeps, workItems: WorkItemService): BoardService {
    const settings = createSettingsService({
        repo: new SettingsRepository(deps.db),
        lookups: createSettingsLookups(deps.db),
        clock: systemClock,
    });

    return createBoardService({
        workItems,
        flows: createAppFlowService({ db: deps.db, events: deps.events, clock: systemClock }),
        runs: new SqliteRunRepository(deps.db, systemClock),
        usage: createAppUsageService({ db: deps.db, settings, clock: systemClock }),
        clock: systemClock,
    });
}

function registerBoardRoute(app: FastifyInstance, board: BoardService): void {
    app.withTypeProvider<ZodTypeProvider>().get(
        PROJECT_BOARD_PATH,
        { schema: { params: projectParamsSchema } },
        (request) => board.getBoard(request.params.projectId),
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
