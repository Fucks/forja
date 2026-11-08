import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import type { RouteModule } from "@/server/route_modules.js";
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
const WORK_ITEM_PATH = "/work-items/:id";
const WORK_ITEM_COLUMN_PATH = `${WORK_ITEM_PATH}/column`;
const WORK_ITEM_ARCHIVE_PATH = `${WORK_ITEM_PATH}/archive`;
const HTTP_CREATED = 201;

const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const workItemParamsSchema = z.object({ id: z.string().min(1) });

export const registerWorkItemsRoutes: RouteModule = (app, deps) => {
    const workItems = createWorkItemService({
        repo: new WorkItemRepository(deps.db),
        events: deps.events,
        clock: systemClock,
    });

    registerProjectWorkItemsRoutes(app, workItems);
    registerWorkItemRoutes(app, workItems);
};

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
