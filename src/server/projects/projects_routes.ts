import { existsSync } from "node:fs";

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import { createProjectInput, renameProjectInput } from "@/server/projects/project_types.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import type { RouteModule } from "@/server/route_modules.js";

const PROJECTS_PATH = "/projects";
const PROJECT_PATH = "/projects/:id";
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

const projectParamsSchema = z.object({ id: z.string().min(1) });

export const registerProjectsRoutes: RouteModule = (app, deps) => {
    const projects = createProjectService({
        repo: new ProjectRepository(deps.db),
        git: deps.git,
        fileExists: existsSync,
        clock: systemClock,
    });

    registerCollectionRoutes(app, projects);
    registerProjectRoutes(app, projects);
};

function registerCollectionRoutes(app: FastifyInstance, projects: ProjectService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(PROJECTS_PATH, () => projects.list());

    typedApp.post(
        PROJECTS_PATH,
        { schema: { body: createProjectInput } },
        async (request, reply) => {
            const project = await projects.create(request.body);
            return reply.code(HTTP_CREATED).send(project);
        },
    );
}

function registerProjectRoutes(app: FastifyInstance, projects: ProjectService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(PROJECT_PATH, { schema: { params: projectParamsSchema } }, (request) =>
        projects.get(request.params.id),
    );

    typedApp.patch(
        PROJECT_PATH,
        { schema: { params: projectParamsSchema, body: renameProjectInput } },
        (request) => projects.rename(request.params.id, request.body.name),
    );

    typedApp.delete(
        PROJECT_PATH,
        { schema: { params: projectParamsSchema } },
        async (request, reply) => {
            await projects.remove(request.params.id);
            return reply.code(HTTP_NO_CONTENT).send();
        },
    );
}
