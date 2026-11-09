import { existsSync } from "node:fs";
import type { ServerResponse } from "node:http";

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { currentHostUser } from "@/integrations/agent_runtime/workspace_layout.js";
import { runtimeAssetPath } from "@/lib/paths.js";
import {
    createAgentImageLookups,
    findTargetOrThrow,
} from "@/server/agent_images/agent_image_lookups.js";
import type { AgentImageLookups } from "@/server/agent_images/agent_image_lookups.js";
import { createAgentImageService } from "@/server/agent_images/agent_image_service.js";
import type { AgentImageService } from "@/server/agent_images/agent_image_service.js";
import { openEventStream } from "@/server/events/events_routes.js";
import type { RouteModule } from "@/server/route_modules.js";
import { AGENT_IMAGE_BUILD_EVENTS } from "@/shared/agent_image_types.js";
import type { AgentImageBuildResult } from "@/shared/agent_image_types.js";

const AGENT_IMAGE_PATH = "/projects/:id/agent-image";
const BUILD_PATH = `${AGENT_IMAGE_PATH}/build`;

const projectParamsSchema = z.object({ id: z.string().min(1) });

type RunBuild = (
    onLine: (line: string) => void,
    signal: AbortSignal,
) => Promise<AgentImageBuildResult>;

export const registerAgentImagesRoutes: RouteModule = (app, deps) => {
    const lookups = createAgentImageLookups(deps.db);
    const agentImages = createAgentImageService({
        lookups,
        commands: deps.commands,
        fileExists: existsSync,
        hostUser: currentHostUser(),
        defaultDockerfile: runtimeAssetPath("assets", "agent-image", "Dockerfile"),
    });

    registerStatusRoute(app, agentImages);
    registerBuildRoute(app, agentImages, lookups);
};

function registerStatusRoute(app: FastifyInstance, agentImages: AgentImageService): void {
    app.withTypeProvider<ZodTypeProvider>().get(
        AGENT_IMAGE_PATH,
        { schema: { params: projectParamsSchema } },
        (request) => agentImages.status(request.params.id),
    );
}

function registerBuildRoute(
    app: FastifyInstance,
    agentImages: AgentImageService,
    lookups: AgentImageLookups,
): void {
    app.withTypeProvider<ZodTypeProvider>().post(
        BUILD_PATH,
        { schema: { params: projectParamsSchema } },
        async (request, reply) => {
            const projectId = request.params.id;
            // Once the stream is open the status is already 200, so a 404 has to come before it.
            findTargetOrThrow(lookups, projectId);

            reply.hijack();
            await streamBuild(reply.raw, (onLine, signal) =>
                agentImages.build(projectId, onLine, signal),
            );
        },
    );
}

// The client cancels the build by closing the connection.
async function streamBuild(response: ServerResponse, runBuild: RunBuild): Promise<void> {
    const cancellation = new AbortController();
    response.on("close", () => cancellation.abort());
    openEventStream(response);

    try {
        const result = await runBuild(
            (line) => writeEvent(response, AGENT_IMAGE_BUILD_EVENTS.line, { line }),
            cancellation.signal,
        );
        writeEvent(response, AGENT_IMAGE_BUILD_EVENTS.done, result);
    } finally {
        response.end();
    }
}

function writeEvent(response: ServerResponse, event: string, payload: unknown): void {
    if (response.destroyed) {
        return;
    }

    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}
