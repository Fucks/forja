import path from "node:path";

import type { HostUser } from "@/integrations/agent_runtime/workspace_layout.js";
import type { AgentImageLookups } from "@/server/agent_images/agent_image_lookups.js";
import { createAgentImageService } from "@/server/agent_images/agent_image_service.js";
import type { AgentImageService } from "@/server/agent_images/agent_image_service.js";
import { NotFoundError } from "@/server/errors.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";

const PROJECT_ID = "prj_forja";
const REPO_PATH = "/home/ana/projetos/forja";
const IMAGE = "forja-agent:latest";
const DEFAULT_DOCKERFILE = "/opt/forja/assets/agent-image/Dockerfile";
const PROJECT_DOCKERFILE = path.join(REPO_PATH, ".sandcastle", "Dockerfile");
const HOST_USER: HostUser = { uid: 501, gid: 20 };
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;
const IMAGE_CREATED_AT = "2026-11-01T12:00:00.123456789Z";
const IMAGE_SIZE_BYTES = 2_147_483_648;
const IMAGE_NOT_FOUND = 1;
const FAILED_BUILD_EXIT_CODE = 17;

const lookups: AgentImageLookups = {
    findTarget: (projectId) =>
        projectId === PROJECT_ID ? { repoPath: REPO_PATH, image: IMAGE } : undefined,
    listImagesInUse: () => [IMAGE],
};

describe("AgentImageService", () => {
    let commands: FakeCommandRunner;
    let existingFiles: Set<string>;

    beforeEach(() => {
        commands = new FakeCommandRunner();
        existingFiles = new Set();
    });

    function createService(hostUser: HostUser | null = HOST_USER): AgentImageService {
        return createAgentImageService({
            lookups,
            commands,
            fileExists: (filePath) => existingFiles.has(filePath),
            hostUser,
            defaultDockerfile: DEFAULT_DOCKERFILE,
        });
    }

    function findBuildCall(): { args: string[]; timeoutMs: number; signal?: AbortSignal } {
        const call = commands.calls.find((recorded) => recorded.args[0] === "build");
        if (!call) {
            throw new Error("docker build was not run");
        }

        return { args: call.args, timeoutMs: call.options.timeoutMs, signal: call.options.signal };
    }

    describe("status", () => {
        it("uses the Forja default Dockerfile when the project has no .sandcastle/Dockerfile", async () => {
            const service = createService();

            const status = await service.status(PROJECT_ID);

            expect(status.source).toBe("forja_default");
        });

        it("uses the project .sandcastle/Dockerfile when the project has one", async () => {
            existingFiles.add(PROJECT_DOCKERFILE);
            const service = createService();

            const status = await service.status(PROJECT_ID);

            expect(status.source).toBe("project_dockerfile");
        });

        it("reports the creation date and size in MB of an existing image", async () => {
            commands.when("docker", ["image", "inspect", IMAGE]).returns({
                stdout: JSON.stringify([{ Created: IMAGE_CREATED_AT, Size: IMAGE_SIZE_BYTES }]),
            });
            const service = createService();

            const status = await service.status(PROJECT_ID);

            expect(status).toEqual({
                image: IMAGE,
                exists: true,
                createdAt: IMAGE_CREATED_AT,
                sizeMb: 2048,
                source: "forja_default",
            });
        });

        it("reports the image as missing when docker image inspect fails", async () => {
            commands.when("docker", ["image", "inspect", IMAGE]).returns({
                exitCode: IMAGE_NOT_FOUND,
                stderr: `Error: No such image: ${IMAGE}`,
            });
            const service = createService();

            const status = await service.status(PROJECT_ID);

            expect(status).toEqual({ image: IMAGE, exists: false, source: "forja_default" });
        });

        it("rejects an unknown project", async () => {
            const service = createService();

            await expect(service.status("prj_unknown")).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe("build", () => {
        it("builds the default Dockerfile with the host UID/GID and a 30-minute timeout", async () => {
            const service = createService();

            await service.build(PROJECT_ID, () => {}, new AbortController().signal);

            expect(findBuildCall()).toMatchObject({
                args: [
                    "build",
                    "-t",
                    IMAGE,
                    "--build-arg",
                    "AGENT_UID=501",
                    "--build-arg",
                    "AGENT_GID=20",
                    "-f",
                    DEFAULT_DOCKERFILE,
                    path.dirname(DEFAULT_DOCKERFILE),
                ],
                timeoutMs: BUILD_TIMEOUT_MS,
            });
        });

        it("builds the project .sandcastle/Dockerfile with its folder as the context", async () => {
            existingFiles.add(PROJECT_DOCKERFILE);
            const service = createService();

            await service.build(PROJECT_ID, () => {}, new AbortController().signal);

            expect(findBuildCall().args.slice(-3)).toEqual([
                "-f",
                PROJECT_DOCKERFILE,
                path.dirname(PROJECT_DOCKERFILE),
            ]);
        });

        it("uses UID/GID 1000 when the host has no user ids (Windows)", async () => {
            const service = createService(null);

            await service.build(PROJECT_ID, () => {}, new AbortController().signal);

            expect(findBuildCall().args).toEqual(
                expect.arrayContaining(["AGENT_UID=1000", "AGENT_GID=1000"]),
            );
        });

        it("sends every stdout and stderr line of the build and reports success", async () => {
            commands.when("docker", (args) => args[0] === "build").returns({
                stdout: "Successfully tagged forja-agent:latest",
                stderr: "#1 [internal] load build definition\n#2 DONE 0.1s",
            });
            const service = createService();
            const lines: string[] = [];

            const result = await service.build(
                PROJECT_ID,
                (line) => lines.push(line),
                new AbortController().signal,
            );

            expect(lines).toEqual([
                "Successfully tagged forja-agent:latest",
                "#1 [internal] load build definition",
                "#2 DONE 0.1s",
            ]);
            expect(result).toEqual({ ok: true, exitCode: 0 });
        });

        it("reports a failed build with its exit code", async () => {
            commands.when("docker", (args) => args[0] === "build").returns({ exitCode: FAILED_BUILD_EXIT_CODE });
            const service = createService();

            const result = await service.build(PROJECT_ID, () => {}, new AbortController().signal);

            expect(result).toEqual({ ok: false, exitCode: FAILED_BUILD_EXIT_CODE });
        });

        it("hands the abort signal to docker build so cancelling stops the command", async () => {
            const service = createService();
            const cancellation = new AbortController();

            await service.build(PROJECT_ID, () => {}, cancellation.signal);
            cancellation.abort();

            expect(findBuildCall().signal?.aborted).toBe(true);
        });
    });
});
