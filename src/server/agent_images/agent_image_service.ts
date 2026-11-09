import path from "node:path";

import { z } from "zod";

import type { HostUser } from "@/integrations/agent_runtime/workspace_layout.js";
import { commandSucceeded } from "@/integrations/process/command_runner.js";
import type { CommandRunner } from "@/integrations/process/command_runner.js";
import type {
    AgentImageLookups,
    AgentImageTarget,
} from "@/server/agent_images/agent_image_lookups.js";
import { NotFoundError } from "@/server/errors.js";
import type {
    AgentImageBuildResult,
    AgentImageSource,
    AgentImageStatus,
} from "@/shared/agent_image_types.js";

export interface AgentImageService {
    status(projectId: string): Promise<AgentImageStatus>;
    build(
        projectId: string,
        onLine: (line: string) => void,
        signal: AbortSignal,
    ): Promise<AgentImageBuildResult>;
}

export interface AgentImageServiceDeps {
    lookups: AgentImageLookups;
    commands: CommandRunner;
    fileExists: (filePath: string) => boolean;
    /** Null on Windows, where there are no user ids to align. */
    hostUser: HostUser | null;
    defaultDockerfile: string;
}

interface DockerfileChoice {
    source: AgentImageSource;
    dockerfile: string;
}

const PROJECT_DOCKERFILE_SEGMENTS = [".sandcastle", "Dockerfile"];
// The UID/GID of the node user in the base image, so the image keeps working unaligned.
const DEFAULT_AGENT_USER: HostUser = { uid: 1000, gid: 1000 };
const INSPECT_TIMEOUT_MS = 10_000;
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;
const BYTES_PER_MB = 1024 * 1024;

const imageDetailsSchema = z.object({ Created: z.string(), Size: z.number() });
// docker image inspect prints a JSON array with one entry per image asked for.
const imageInspectionSchema = z.tuple([imageDetailsSchema], imageDetailsSchema);

export function createAgentImageService(deps: AgentImageServiceDeps): AgentImageService {
    function findTargetOrThrow(projectId: string): AgentImageTarget {
        const target = deps.lookups.findTarget(projectId);
        if (!target) {
            throw new NotFoundError(`Projeto ${projectId} não encontrado.`);
        }

        return target;
    }

    function chooseDockerfile(repoPath: string): DockerfileChoice {
        const projectDockerfile = path.join(repoPath, ...PROJECT_DOCKERFILE_SEGMENTS);
        if (deps.fileExists(projectDockerfile)) {
            return { source: "project_dockerfile", dockerfile: projectDockerfile };
        }

        return { source: "forja_default", dockerfile: deps.defaultDockerfile };
    }

    return {
        async status(projectId) {
            const target = findTargetOrThrow(projectId);
            const { source } = chooseDockerfile(target.repoPath);
            const inspection = await inspectImage(deps.commands, target.image);

            return { image: target.image, source, ...inspection };
        },

        async build(projectId, onLine, signal) {
            const target = findTargetOrThrow(projectId);
            const { dockerfile } = chooseDockerfile(target.repoPath);
            const agentUser = deps.hostUser ?? DEFAULT_AGENT_USER;
            const result = await deps.commands.run(
                "docker",
                buildImageArgs({ image: target.image, dockerfile, agentUser }),
                {
                    timeoutMs: BUILD_TIMEOUT_MS,
                    signal,
                    onStdoutLine: onLine,
                    onStderrLine: onLine,
                },
            );

            return { ok: commandSucceeded(result), exitCode: result.exitCode };
        },
    };
}

type ImageInspection = Pick<AgentImageStatus, "exists" | "createdAt" | "sizeMb">;

async function inspectImage(commands: CommandRunner, image: string): Promise<ImageInspection> {
    const result = await commands.run("docker", ["image", "inspect", image], {
        timeoutMs: INSPECT_TIMEOUT_MS,
    });
    if (!commandSucceeded(result)) {
        return { exists: false };
    }

    const [details] = imageInspectionSchema.parse(JSON.parse(result.stdout));
    return {
        exists: true,
        createdAt: details.Created,
        sizeMb: Math.round(details.Size / BYTES_PER_MB),
    };
}

function buildImageArgs({
    image,
    dockerfile,
    agentUser,
}: {
    image: string;
    dockerfile: string;
    agentUser: HostUser;
}): string[] {
    return [
        "build",
        "-t",
        image,
        "--build-arg",
        `AGENT_UID=${agentUser.uid}`,
        "--build-arg",
        `AGENT_GID=${agentUser.gid}`,
        "-f",
        dockerfile,
        path.dirname(dockerfile),
    ];
}
