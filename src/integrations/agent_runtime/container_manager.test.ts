import {
    AgentCanceledError,
    AgentTimeoutError,
    WorkspaceError,
} from "@/integrations/agent_runtime/agent_errors.js";
import {
    createContainerManager,
    type ContainerExecOptions,
    type ContainerManager,
    type StartContainerInput,
    wrapWithExecMarker,
} from "@/integrations/agent_runtime/container_manager.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";

const CONTAINER_ID = "c0ffee";
const EXEC_ID = "forja-exec-1";
const WORKTREE_PATH = "/home/ana/.forja/worktrees/prj_1/forja__issue-7";
const SECRET_TOKEN = "sk-ant-super-secret";

const START_INPUT: StartContainerInput = {
    name: "forja-12345678-87654321",
    image: "forja/agent:latest",
    mounts: [
        { host: WORKTREE_PATH, container: "/home/agent/workspace" },
        { host: "/repos/forja/.git", container: "/repos/forja/.git", readOnly: true },
    ],
    labels: { "forja.workspace": "forja-12345678-87654321", "forja.run": "run_1" },
    workdir: "/home/agent/workspace",
};

const RUN_ARGS = [
    "run",
    "-d",
    "--rm=false",
    "--name",
    "forja-12345678-87654321",
    "--label",
    "forja.workspace=forja-12345678-87654321",
    "--label",
    "forja.run=run_1",
    "-v",
    `${WORKTREE_PATH}:/home/agent/workspace`,
    "-v",
    "/repos/forja/.git:/repos/forja/.git:ro",
    "-w",
    "/home/agent/workspace",
];
const RUN_IMAGE_ARGS = ["--entrypoint", "sleep", "forja/agent:latest", "infinity"];

function createManager(commands: FakeCommandRunner): ContainerManager {
    return createContainerManager(commands, () => EXEC_ID);
}

function execOptions(overrides: Partial<ContainerExecOptions> = {}): ContainerExecOptions {
    return { env: {}, timeoutMs: 60_000, signal: new AbortController().signal, ...overrides };
}

function scriptExec(commands: FakeCommandRunner, command: string[]) {
    const execArgs = ["exec", "-e", "FORJA_EXEC_ID", CONTAINER_ID];
    return commands.when("docker", [...execArgs, ...wrapWithExecMarker(command, EXEC_ID)]);
}

describe("ContainerManager.start", () => {
    it("runs a detached long-lived container with the labels, mounts and working directory", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("docker", [...RUN_ARGS, ...RUN_IMAGE_ARGS])
            .returns({ stdout: `${CONTAINER_ID}\n` });

        const container = await createManager(commands).start(START_INPUT);

        expect(container).toEqual({ id: CONTAINER_ID });
    });

    it("runs as the given user on the given network", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("docker", [
                ...RUN_ARGS,
                "--user",
                "1000:1000",
                "--network",
                "forja-net",
                ...RUN_IMAGE_ARGS,
            ])
            .returns({ stdout: CONTAINER_ID });

        const starting = createManager(commands).start({
            ...START_INPUT,
            user: "1000:1000",
            network: "forja-net",
        });

        await expect(starting).resolves.toEqual({ id: CONTAINER_ID });
    });

    it("throws a WorkspaceError with docker's message when the container does not start", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("docker", [...RUN_ARGS, ...RUN_IMAGE_ARGS])
            .returns({ exitCode: 125, stderr: "Unable to find image 'forja/agent:latest'" });

        const starting = createManager(commands).start(START_INPUT);

        await expect(starting).rejects.toBeInstanceOf(WorkspaceError);
        await expect(starting).rejects.toThrow("Unable to find image");
    });
});

describe("ContainerManager.exec", () => {
    it("passes only variable names in the arguments and their values in the docker environment", async () => {
        const commands = new FakeCommandRunner();

        await createManager(commands).exec(
            CONTAINER_ID,
            ["claude", "-p"],
            execOptions({ env: { ANTHROPIC_API_KEY: SECRET_TOKEN } }),
        );

        const [call] = commands.calls;
        expect(call?.args.slice(0, 6)).toEqual([
            "exec",
            "-e",
            "FORJA_EXEC_ID",
            "-e",
            "ANTHROPIC_API_KEY",
            CONTAINER_ID,
        ]);
        expect(call?.args.join(" ")).not.toContain(SECRET_TOKEN);
        expect(call?.options.env).toEqual({
            FORJA_EXEC_ID: EXEC_ID,
            ANTHROPIC_API_KEY: SECRET_TOKEN,
        });
    });

    it("runs the command behind a shell wrapper whose arguments carry the exec marker", async () => {
        const commands = new FakeCommandRunner();

        await createManager(commands).exec(CONTAINER_ID, ["git", "status"], execOptions());

        const wrappedCommand = commands.calls[0]?.args.slice(4);
        expect(wrappedCommand?.slice(0, 2)).toEqual(["sh", "-c"]);
        expect(wrappedCommand?.slice(3)).toEqual([EXEC_ID, "git", "status"]);
    });

    it("runs the command in the given working directory", async () => {
        const commands = new FakeCommandRunner();

        await createManager(commands).exec(
            CONTAINER_ID,
            ["ls"],
            execOptions({ workdir: "/home/agent/workspace/web" }),
        );

        const [call] = commands.calls;
        expect(call?.args.slice(0, 5)).toEqual([
            "exec",
            "-w",
            "/home/agent/workspace/web",
            "-e",
            "FORJA_EXEC_ID",
        ]);
    });

    it("keeps stdin open and forwards it when given", async () => {
        const commands = new FakeCommandRunner();

        await createManager(commands).exec(CONTAINER_ID, ["cat"], execOptions({ stdin: "prompt" }));

        const [call] = commands.calls;
        expect(call?.args.slice(0, 2)).toEqual(["exec", "-i"]);
        expect(call?.options.input).toBe("prompt");
    });

    it("streams each output line and returns the exit code with the output tails", async () => {
        const commands = new FakeCommandRunner();
        scriptExec(commands, ["npm", "test"]).returns({
            exitCode: 1,
            stdout: "ok 1\nnot ok 2",
            stderr: "1 failing",
        });
        const stdoutLines: string[] = [];
        const stderrLines: string[] = [];

        const result = await createManager(commands).exec(
            CONTAINER_ID,
            ["npm", "test"],
            execOptions({
                onStdoutLine: (line) => stdoutLines.push(line),
                onStderrLine: (line) => stderrLines.push(line),
            }),
        );

        expect(result).toEqual({
            exitCode: 1,
            stdoutTail: "ok 1\nnot ok 2",
            stderrTail: "1 failing",
        });
        expect(stdoutLines).toEqual(["ok 1", "not ok 2"]);
        expect(stderrLines).toEqual(["1 failing"]);
    });

    it("keeps only the end of a long output", async () => {
        const commands = new FakeCommandRunner();
        const longOutput = `${"x".repeat(10_000)}fim`;
        scriptExec(commands, ["npm", "test"]).returns({ stdout: longOutput });

        const result = await createManager(commands).exec(
            CONTAINER_ID,
            ["npm", "test"],
            execOptions(),
        );

        expect(result.stdoutTail.length).toBeLessThan(longOutput.length);
        expect(result.stdoutTail.endsWith("fim")).toBe(true);
    });

    it("kills the process inside the container by its marker and rejects when aborted", async () => {
        const commands = new FakeCommandRunner();
        const controller = new AbortController();
        controller.abort();

        const executing = createManager(commands).exec(
            CONTAINER_ID,
            ["claude", "-p"],
            execOptions({ signal: controller.signal }),
        );

        await expect(executing).rejects.toBeInstanceOf(AgentCanceledError);
        expect(commands.calls[0]?.options.signal).toBe(controller.signal);
        expect(commands.calls.at(-1)?.args).toEqual([
            "exec",
            CONTAINER_ID,
            "pkill",
            "-f",
            "--",
            EXEC_ID,
        ]);
    });

    it("kills the process inside the container and rejects with a timeout when it runs too long", async () => {
        const commands = new FakeCommandRunner();
        scriptExec(commands, ["sleep", "999"]).returns({ exitCode: -1, timedOut: true });

        const executing = createManager(commands).exec(
            CONTAINER_ID,
            ["sleep", "999"],
            execOptions({ timeoutMs: 5 }),
        );

        await expect(executing).rejects.toEqual(new AgentTimeoutError("total"));
        expect(commands.calls[0]?.options.timeoutMs).toBe(5);
        expect(commands.calls.at(-1)?.args).toEqual([
            "exec",
            CONTAINER_ID,
            "pkill",
            "-f",
            "--",
            EXEC_ID,
        ]);
    });
});

describe("ContainerManager.stop", () => {
    it("force-removes the container", async () => {
        const commands = new FakeCommandRunner();
        commands.when("docker", ["rm", "-f", CONTAINER_ID]).returns({});

        await createManager(commands).stop(CONTAINER_ID);

        expect(commands.calls.map((call) => call.args)).toEqual([["rm", "-f", CONTAINER_ID]]);
    });

    it("succeeds when the container no longer exists", async () => {
        const commands = new FakeCommandRunner();
        commands.when("docker", ["rm", "-f", CONTAINER_ID]).returns({
            exitCode: 1,
            stderr: `Error response from daemon: No such container: ${CONTAINER_ID}`,
        });

        await expect(createManager(commands).stop(CONTAINER_ID)).resolves.toBeUndefined();
    });

    it("throws a WorkspaceError when docker cannot remove the container", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("docker", ["rm", "-f", CONTAINER_ID])
            .returns({ exitCode: 1, stderr: "Cannot connect to the Docker daemon" });

        await expect(createManager(commands).stop(CONTAINER_ID)).rejects.toThrow(WorkspaceError);
    });
});

describe("ContainerManager.list", () => {
    const LIST_FORMAT = ["--format", "{{.ID}}\t{{.Labels}}"];

    it("filters containers by label value, or by label presence when the value is empty", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("docker", [
                "ps",
                "-a",
                "--filter",
                "label=forja.workspace",
                "--filter",
                "label=forja.run=run_1",
                ...LIST_FORMAT,
            ])
            .returns({
                stdout: "c1\tforja.workspace=w1,forja.run=run_1\nc2\tforja.run=run_1,forja.workspace=w2",
            });

        const containers = await createManager(commands).list({
            "forja.workspace": "",
            "forja.run": "run_1",
        });

        expect(containers).toEqual([
            { id: "c1", labels: { "forja.workspace": "w1", "forja.run": "run_1" } },
            { id: "c2", labels: { "forja.run": "run_1", "forja.workspace": "w2" } },
        ]);
    });

    it("returns no containers when none match", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("docker", ["ps", "-a", "--filter", "label=forja.workspace", ...LIST_FORMAT])
            .returns({ stdout: "" });

        const containers = await createManager(commands).list({ "forja.workspace": "" });

        expect(containers).toEqual([]);
    });

    it("throws a WorkspaceError when docker cannot list containers", async () => {
        const commands = new FakeCommandRunner();

        const listing = createManager(commands).list({ "forja.workspace": "" });

        await expect(listing).rejects.toThrow(WorkspaceError);
    });

    it("says docker is missing when the docker command is not on the PATH", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("docker", ["ps", "-a", "--filter", "label=forja.workspace", ...LIST_FORMAT])
            .returns({ exitCode: -1, notFound: true });

        const listing = createManager(commands).list({ "forja.workspace": "" });

        await expect(listing).rejects.toThrow(
            "Não foi possível listar os containers da Forja: o comando docker não foi encontrado",
        );
    });

    it("says docker did not answer when the docker command times out", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("docker", ["ps", "-a", "--filter", "label=forja.workspace", ...LIST_FORMAT])
            .returns({ exitCode: -1, timedOut: true });

        const listing = createManager(commands).list({ "forja.workspace": "" });

        await expect(listing).rejects.toThrow(
            "Não foi possível listar os containers da Forja: o Docker não respondeu a tempo",
        );
    });
});
