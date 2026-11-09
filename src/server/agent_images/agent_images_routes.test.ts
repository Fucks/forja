import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import type { AgentImageStatus } from "@/shared/agent_image_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import type {
    CommandOptions,
    CommandResult,
    CommandRunner,
} from "@/integrations/process/command_runner.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const PROJECT_ID = "prj_forja";
const IMAGE = "forja-agent:latest";
const AGENT_IMAGE_URL = `/api/projects/${PROJECT_ID}/agent-image`;
const BUILD_URL = `${AGENT_IMAGE_URL}/build`;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const FAILED_BUILD_EXIT_CODE = 1;
const KILLED_EXIT_CODE = -1;
const EPHEMERAL_PORT = 0;
const LOCALHOST = "127.0.0.1";

// Prints one line and then runs until its signal aborts, like a docker build the user cancels.
class EndlessBuildRunner implements CommandRunner {
    readonly aborted: Promise<void>;
    private markAborted: () => void = () => {};

    constructor() {
        this.aborted = new Promise((resolve) => (this.markAborted = resolve));
    }

    run(_command: string, _args: string[], options: CommandOptions): Promise<CommandResult> {
        options.onStdoutLine?.("#1 load build definition");

        return new Promise((resolve) => {
            options.signal?.addEventListener("abort", () => {
                this.markAborted();
                resolve({ exitCode: KILLED_EXIT_CODE, stdout: "", stderr: "", timedOut: false });
            });
        });
    }
}

describe("agent image routes", () => {
    let database: DatabaseHandle;
    let commands: FakeCommandRunner;
    let app: FastifyInstance;

    beforeEach(async () => {
        database = createTestDb();
        new ProjectRepository(database.db).insert(buildProject({ id: PROJECT_ID }));
        commands = new FakeCommandRunner();
        app = await buildApp(createTestAppDeps(database.db, { commands }));
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    function scriptBuild(result: { stdout?: string; exitCode?: number }): void {
        commands.when("docker", (args) => args[0] === "build").returns(result);
    }

    it("answers the status of the project's agent image", async () => {
        const response = await app.inject({ method: "GET", url: AGENT_IMAGE_URL });

        expect(response.statusCode).toBe(HTTP_OK);
        expect(response.json<AgentImageStatus>()).toEqual({
            image: IMAGE,
            exists: false,
            source: "forja_default",
        });
    });

    it("streams each build line and ends with a done event", async () => {
        scriptBuild({ stdout: "#1 load build definition\n#2 DONE" });

        const response = await app.inject({ method: "POST", url: BUILD_URL });

        expect(response.headers["content-type"]).toContain("text/event-stream");
        expect(response.body).toBe(
            [
                'event: line\ndata: {"line":"#1 load build definition"}\n\n',
                'event: line\ndata: {"line":"#2 DONE"}\n\n',
                'event: done\ndata: {"ok":true,"exitCode":0}\n\n',
            ].join(""),
        );
    });

    it("reports a failed build in the done event", async () => {
        scriptBuild({ exitCode: FAILED_BUILD_EXIT_CODE });

        const response = await app.inject({ method: "POST", url: BUILD_URL });

        expect(response.body).toContain(
            `event: done\ndata: {"ok":false,"exitCode":${FAILED_BUILD_EXIT_CODE}}\n\n`,
        );
    });

    it("answers 404 for the status and the build of an unknown project", async () => {
        const unknownUrl = "/api/projects/prj_unknown/agent-image";

        const status = await app.inject({ method: "GET", url: unknownUrl });
        const build = await app.inject({ method: "POST", url: `${unknownUrl}/build` });

        expect(status.statusCode).toBe(HTTP_NOT_FOUND);
        expect(build.statusCode).toBe(HTTP_NOT_FOUND);
    });

    it("aborts the build when the client closes the connection", async () => {
        const runner = new EndlessBuildRunner();
        const listeningApp = await buildApp(createTestAppDeps(database.db, { commands: runner }));
        const baseUrl = await listeningApp.listen({ host: LOCALHOST, port: EPHEMERAL_PORT });
        const cancellation = new AbortController();

        const response = await fetch(`${baseUrl}${BUILD_URL}`, {
            method: "POST",
            signal: cancellation.signal,
        });
        await response.body?.getReader().read();
        cancellation.abort();

        await expect(runner.aborted).resolves.toBeUndefined();
        await listeningApp.close();
    });
});
