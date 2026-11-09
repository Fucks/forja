import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
    AgentCanceledError,
    AgentRuntimeError,
    WorkspaceError,
} from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentEvent,
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
    HeadlessSpec,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import type { RunAgentInContainer } from "@/integrations/agent_runtime/agent_container.js";
import { createDockerAgentRuntime } from "@/integrations/agent_runtime/docker_agent_runtime.js";
import { resolvePaths, type ForjaPaths } from "@/lib/paths.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";
import { resultLine } from "@/test/fixtures/stream_json_fixtures.js";

const NOW = new Date("2026-11-08T10:00:00Z");
const REPO_PATH = "/repos/forja";
const BRANCH = "forja/issue-7";
const CONTAINER_ID = "c0ffee";
const WORKSPACE_ID = "forja-9t0v1w2x-9taaaaaa";
const SECRET_TOKEN = "sk-ant-super-secret";
const SILENT_HOOKS: AgentRunHooks = { onEvent: () => undefined };
const AGENT_RESULT: AgentRunResult = {
    summary: "feito",
    commits: [],
    usage: {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
    },
    iterations: 1,
};

let paths: ForjaPaths;
let worktreePath: string;

beforeEach(() => {
    paths = resolvePaths(mkdtempSync(path.join(tmpdir(), "forja-runtime-")), "/home/ana");
    worktreePath = path.join(paths.worktrees, "prj_1", "forja__issue-7");
});

afterEach(() => {
    rmSync(paths.root, { recursive: true, force: true });
});

function workspaceSpec(overrides: Partial<WorkspaceSpec> = {}): WorkspaceSpec {
    return {
        projectId: "prj_1",
        runId: "run_01J9ZK3M4N5P6Q7R8S9T0V1W2X",
        workItemId: "itm_01J9ZK3M4N5P6Q7R8S9TAAAAAA",
        repoPath: REPO_PATH,
        branch: BRANCH,
        baseBranch: "main",
        image: "forja/agent:latest",
        env: {},
        setupCommands: [],
        files: [],
        ...overrides,
    };
}

function headlessSpec(): HeadlessSpec {
    return {
        projectId: "prj_1",
        runId: "run_01J9ZK3M4N5P6Q7R8S9T0V1W2X",
        repoPath: REPO_PATH,
        baseBranch: "main",
        image: "forja/agent:latest",
        env: {},
        setupCommands: [],
    };
}

function runRequest(): AgentRunRequest {
    return {
        nodeRunId: "nrn_01J9ZK3M4N5P6Q7R8S9THEADLS",
        prompt: "planeje",
        model: "claude-sonnet-5-5",
        effort: "medium",
        maxIterations: 1,
        idleTimeoutSeconds: 600,
        timeoutMs: 3_600_000,
        permissionMode: "bypassPermissions",
        toolArgs: [],
        expandPromptCommands: false,
        env: {},
        signal: neverAborted(),
    };
}

function neverAborted(): AbortSignal {
    return new AbortController().signal;
}

function isDocker(subcommand: string) {
    return (args: string[]) => args[0] === subcommand;
}

function isDockerExecOf(command: string) {
    return (args: string[]) => args[0] === "exec" && args.includes(command);
}

function scriptHealthyHost(commands: FakeCommandRunner): void {
    commands
        .when("git", ["worktree", "list", "--porcelain"])
        .returns({ stdout: `worktree ${REPO_PATH}\n` });
    commands.when("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`]).returns({});
    commands.when("git", ["worktree", "add", worktreePath, BRANCH]).returns({});
    commands.when("git", ["rev-parse", "--git-common-dir"]).returns({ stdout: ".git\n" });
    commands.when("git", ["worktree", "prune"]).returns({});
    commands.when("docker", isDocker("run")).returns({ stdout: `${CONTAINER_ID}\n` });
    commands.when("docker", isDocker("exec")).returns({});
    commands.when("docker", ["rm", "-f", CONTAINER_ID]).returns({});
    commands
        .when("docker", ["rm", "-f", WORKSPACE_ID])
        .returns({ exitCode: 1, stderr: `Error: No such container: ${WORKSPACE_ID}` });
}

function scriptRegisteredWorktree(commands: FakeCommandRunner): void {
    commands
        .when("git", ["worktree", "list", "--porcelain"])
        .returns({ stdout: `worktree ${REPO_PATH}\n\nworktree ${worktreePath}\n` });
    commands.when("git", ["worktree", "remove", "--force", worktreePath]).returns({});
}

function createRuntime(
    commands: FakeCommandRunner,
    overrides: {
        hostUser?: { uid: number; gid: number } | null;
        runAgentInContainer?: RunAgentInContainer;
    } = {},
) {
    return createDockerAgentRuntime({
        commands,
        paths,
        clock: new FakeClock(NOW),
        hostUser: { uid: 1000, gid: 1001 },
        ...overrides,
    });
}

function argsOf(commands: FakeCommandRunner, command: string): string[][] {
    return commands.calls.filter((call) => call.command === command).map((call) => call.args);
}

function dockerRunArgs(commands: FakeCommandRunner): string[] | undefined {
    return argsOf(commands, "docker").find(isDocker("run"));
}

function dockerExecCommands(commands: FakeCommandRunner): string[][] {
    return argsOf(commands, "docker")
        .filter(isDocker("exec"))
        .map((args) => args.slice(-3));
}

describe("DockerAgentRuntime.openWorkspace", () => {
    it("creates the item worktree and starts its container with the documented mounts and labels", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);

        const workspace = await createRuntime(commands).openWorkspace(
            workspaceSpec(),
            SILENT_HOOKS,
            neverAborted(),
        );

        expect(workspace).toMatchObject({ id: WORKSPACE_ID, branch: BRANCH, root: worktreePath });
        expect(argsOf(commands, "git")).toContainEqual(["worktree", "add", worktreePath, BRANCH]);
        expect(dockerRunArgs(commands)).toEqual([
            "run",
            "-d",
            "--rm=false",
            "--name",
            WORKSPACE_ID,
            "--label",
            `forja.workspace=${WORKSPACE_ID}`,
            "--label",
            "forja.run=run_01J9ZK3M4N5P6Q7R8S9T0V1W2X",
            "--label",
            "forja.item=itm_01J9ZK3M4N5P6Q7R8S9TAAAAAA",
            "--label",
            "forja.project=prj_1",
            "-v",
            `${worktreePath}:/home/agent/workspace`,
            "-v",
            "/repos/forja/.git:/repos/forja/.git",
            "-w",
            "/home/agent/workspace",
            "--user",
            "1000:1001",
            "forja/agent:latest",
            "sleep",
            "infinity",
        ]);
    });

    it("creates a new branch from origin/<base> when the item branch does not exist", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);
        commands
            .when("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`])
            .returns({ exitCode: 1 });
        commands
            .when("git", ["worktree", "add", "-b", BRANCH, worktreePath, "origin/main"])
            .returns({});

        await createRuntime(commands).openWorkspace(workspaceSpec(), SILENT_HOOKS, neverAborted());

        expect(argsOf(commands, "git")).toContainEqual([
            "worktree",
            "add",
            "-b",
            BRANCH,
            worktreePath,
            "origin/main",
        ]);
    });

    it("keeps the image's default user when there is no host user", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);

        await createRuntime(commands, { hostUser: null }).openWorkspace(
            workspaceSpec(),
            SILENT_HOOKS,
            neverAborted(),
        );

        expect(dockerRunArgs(commands)).not.toContain("--user");
    });

    it("reuses the worktree when the same item is opened twice", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);
        const runtime = createRuntime(commands);

        const first = await runtime.openWorkspace(workspaceSpec(), SILENT_HOOKS, neverAborted());
        scriptRegisteredWorktree(commands);
        const second = await runtime.openWorkspace(workspaceSpec(), SILENT_HOOKS, neverAborted());

        expect(second.root).toBe(first.root);
        const worktreeAdds = argsOf(commands, "git").filter((args) => args[1] === "add");
        expect(worktreeAdds).toHaveLength(1);
    });

    it("replaces a leftover container of the same workspace before starting a new one", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);
        commands.when("docker", ["rm", "-f", WORKSPACE_ID]).returns({});

        await createRuntime(commands).openWorkspace(workspaceSpec(), SILENT_HOOKS, neverAborted());

        const dockerCalls = argsOf(commands, "docker");
        const removal = dockerCalls.findIndex((args) => args.join(" ") === `rm -f ${WORKSPACE_ID}`);
        expect(removal).toBeGreaterThanOrEqual(0);
        expect(removal).toBeLessThan(dockerCalls.findIndex(isDocker("run")));
    });

    it("writes the spec files into the worktree and then runs the setup commands", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);

        await createRuntime(commands).openWorkspace(
            workspaceSpec({
                files: [{ path: ".forja/contexto.md", content: "issue 7" }],
                setupCommands: [
                    { command: "npm ci", timeoutMs: 60_000 },
                    { command: "npm run build", timeoutMs: 60_000 },
                ],
            }),
            SILENT_HOOKS,
            neverAborted(),
        );

        expect(readFileSync(path.join(worktreePath, ".forja", "contexto.md"), "utf8")).toBe(
            "issue 7",
        );
        expect(dockerExecCommands(commands)).toEqual([
            ["sh", "-c", "npm ci"],
            ["sh", "-c", "npm run build"],
        ]);
    });

    it("emits each setup output line as a system event", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);
        commands
            .when("docker", isDocker("exec"))
            .returns({ stdout: "added 12 packages", stderr: "aviso" });
        const events: AgentEvent[] = [];

        await createRuntime(commands).openWorkspace(
            workspaceSpec({ setupCommands: [{ command: "npm ci", timeoutMs: 60_000 }] }),
            { onEvent: (event) => events.push(event) },
            neverAborted(),
        );

        expect(events).toEqual(
            expect.arrayContaining([
                { kind: "system", message: "added 12 packages", at: NOW },
                { kind: "system", message: "aviso", at: NOW },
            ]),
        );
    });

    it("never puts environment values in the command arguments", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);

        const workspace = await createRuntime(commands).openWorkspace(
            workspaceSpec({
                env: { ANTHROPIC_API_KEY: SECRET_TOKEN },
                setupCommands: [{ command: "npm ci", timeoutMs: 60_000 }],
            }),
            SILENT_HOOKS,
            neverAborted(),
        );
        await workspace.exec("npm test", { timeoutMs: 60_000, signal: neverAborted() });

        const everyArgument = commands.calls.flatMap((call) => call.args).join(" ");
        expect(everyArgument).not.toContain(SECRET_TOKEN);
        const execCalls = commands.calls.filter((call) => isDocker("exec")(call.args));
        expect(execCalls).toHaveLength(2);
        execCalls.forEach((call) => {
            expect(call.options.env).toMatchObject({ ANTHROPIC_API_KEY: SECRET_TOKEN });
        });
    });

    it("removes the container and throws a WorkspaceError with the output when setup fails", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);
        commands
            .when("docker", isDocker("exec"))
            .returns({ exitCode: 1, stderr: "npm ERR! missing script: build" });

        const opening = createRuntime(commands).openWorkspace(
            workspaceSpec({ setupCommands: [{ command: "npm run build", timeoutMs: 60_000 }] }),
            SILENT_HOOKS,
            neverAborted(),
        );

        await expect(opening).rejects.toBeInstanceOf(WorkspaceError);
        await expect(opening).rejects.toThrow("npm ERR! missing script: build");
        expect(argsOf(commands, "docker").at(-1)).toEqual(["rm", "-f", CONTAINER_ID]);
    });

    it("rejects without touching git or docker when the signal was already aborted", async () => {
        const commands = new FakeCommandRunner();
        const controller = new AbortController();
        controller.abort();

        const opening = createRuntime(commands).openWorkspace(
            workspaceSpec(),
            SILENT_HOOKS,
            controller.signal,
        );

        await expect(opening).rejects.toBeInstanceOf(AgentCanceledError);
        expect(commands.calls).toEqual([]);
    });
});

describe("DockerAgentRuntime workspace", () => {
    async function openWorkspace(
        commands: FakeCommandRunner,
        runAgentInContainer?: RunAgentInContainer,
    ) {
        scriptHealthyHost(commands);
        const runtime = createRuntime(commands, { runAgentInContainer });
        const workspace = await runtime.openWorkspace(
            workspaceSpec(),
            SILENT_HOOKS,
            neverAborted(),
        );

        return { runtime, workspace };
    }

    it("runs a shell command in the container, streaming every output line", async () => {
        const commands = new FakeCommandRunner();
        const { workspace } = await openWorkspace(commands);
        commands
            .when("docker", isDocker("exec"))
            .returns({ exitCode: 2, stdout: "1 failing", stderr: "erro" });
        const outputLines: string[] = [];

        const result = await workspace.exec("npm test", {
            timeoutMs: 60_000,
            signal: neverAborted(),
            onOutput: (line) => outputLines.push(line),
        });

        expect(result).toEqual({ exitCode: 2, stdoutTail: "1 failing" });
        expect(outputLines).toEqual(["1 failing", "erro"]);
        expect(dockerExecCommands(commands).at(-1)).toEqual(["sh", "-c", "npm test"]);
    });

    it("diffs the branch against the base in the worktree, stat first", async () => {
        const commands = new FakeCommandRunner();
        const { workspace } = await openWorkspace(commands);
        commands.when("git", ["diff", "--stat", "main...HEAD"]).returns({ stdout: " a.ts | 1 +" });
        commands.when("git", ["diff", "main...HEAD"]).returns({ stdout: "+novo" });

        const diff = await workspace.diff("main");

        expect(diff).toBe(" a.ts | 1 +\n\n+novo");
        const diffCall = commands.calls.find((call) => call.args[0] === "diff");
        expect(diffCall?.options.cwd).toBe(worktreePath);
    });

    it("truncates the diff at 200 KB", async () => {
        const commands = new FakeCommandRunner();
        const { workspace } = await openWorkspace(commands);
        commands.when("git", ["diff", "--stat", "main...HEAD"]).returns({ stdout: "stat" });
        commands.when("git", ["diff", "main...HEAD"]).returns({ stdout: "x".repeat(300 * 1024) });

        const diff = await workspace.diff("main");

        expect(diff.length).toBeLessThan(201 * 1024);
        expect(diff.startsWith("stat")).toBe(true);
    });

    it("writes files relative to the worktree root", async () => {
        const commands = new FakeCommandRunner();
        const { workspace } = await openWorkspace(commands);

        await workspace.writeFiles([{ path: "docs/plano.md", content: "passo 1" }]);

        expect(readFileSync(path.join(worktreePath, "docs", "plano.md"), "utf8")).toBe("passo 1");
    });

    it("refuses to write a file outside the worktree", async () => {
        const commands = new FakeCommandRunner();
        const { workspace } = await openWorkspace(commands);

        const writing = workspace.writeFiles([{ path: "../../fora.md", content: "x" }]);

        await expect(writing).rejects.toBeInstanceOf(WorkspaceError);
    });

    it("runs the agent in the workspace container", async () => {
        const commands = new FakeCommandRunner();
        const runAgentInContainer = vi.fn<RunAgentInContainer>().mockResolvedValue(AGENT_RESULT);
        const { workspace } = await openWorkspace(commands, runAgentInContainer);

        const result = await workspace.runAgent(runRequest(), SILENT_HOOKS);

        expect(result).toBe(AGENT_RESULT);
        expect(runAgentInContainer.mock.calls[0]?.[0]).toMatchObject({ containerId: CONTAINER_ID });
    });

    it("runs Claude Code in the container by default and returns the commits of the worktree", async () => {
        const commands = new FakeCommandRunner();
        const { workspace } = await openWorkspace(commands);
        commands.when("docker", isDockerExecOf("claude")).returns({ stdout: resultLine() });
        commands.when("git", ["rev-parse", "HEAD"]).returns({ stdout: "base\n" });
        commands.when("git", ["rev-list", "--reverse", "base..HEAD"]).returns({ stdout: "sha1\n" });

        const result = await workspace.runAgent(runRequest(), SILENT_HOOKS);

        expect(result).toMatchObject({ summary: "feito", commits: [{ sha: "sha1" }] });
        const gitLogCall = commands.calls.find((call) => call.args[0] === "rev-list");
        expect(gitLogCall?.options.cwd).toBe(worktreePath);
    });

    it("removes the container and the worktree on close but keeps the branch", async () => {
        const commands = new FakeCommandRunner();
        const { workspace } = await openWorkspace(commands);
        scriptRegisteredWorktree(commands);

        await workspace.close();

        expect(argsOf(commands, "docker")).toContainEqual(["rm", "-f", CONTAINER_ID]);
        expect(argsOf(commands, "git")).toContainEqual([
            "worktree",
            "remove",
            "--force",
            worktreePath,
        ]);
        expect(argsOf(commands, "git").filter((args) => args[0] === "branch")).toEqual([]);
    });

    it("does not fail when closed twice", async () => {
        const commands = new FakeCommandRunner();
        const { workspace } = await openWorkspace(commands);
        commands.when("docker", isDocker("ps")).returns({ stdout: "" });

        await workspace.close();

        await expect(workspace.close()).resolves.toBeUndefined();
    });
});

describe("DockerAgentRuntime open workspaces", () => {
    it("lists Forja containers by label even without anything in memory", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("docker", [
                "ps",
                "-a",
                "--filter",
                "label=forja.workspace",
                "--format",
                "{{.ID}}\t{{.Labels}}",
            ])
            .returns({
                stdout: "c1\tforja.workspace=forja-a-b,forja.run=run_1,forja.item=itm_1,forja.project=prj_1",
            });

        const openWorkspaces = await createRuntime(commands).listOpenWorkspaces();

        expect(openWorkspaces).toEqual([{ id: "forja-a-b", runId: "run_1", workItemId: "itm_1" }]);
    });

    it("closes an orphan workspace by removing the containers found by its label", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("docker", [
                "ps",
                "-a",
                "--filter",
                "label=forja.workspace=forja-a-b",
                "--format",
                "{{.ID}}\t{{.Labels}}",
            ])
            .returns({ stdout: "c1\tforja.workspace=forja-a-b" });
        commands.when("docker", ["rm", "-f", "c1"]).returns({});

        await createRuntime(commands).closeWorkspace("forja-a-b");

        expect(argsOf(commands, "docker").at(-1)).toEqual(["rm", "-f", "c1"]);
    });
});

describe("DockerAgentRuntime.runHeadless", () => {
    it("runs the agent in an ephemeral container with the repository mounted read-only", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);
        const runAgentInContainer = vi.fn<RunAgentInContainer>().mockResolvedValue(AGENT_RESULT);

        const result = await createRuntime(commands, { runAgentInContainer }).runHeadless(
            headlessSpec(),
            runRequest(),
            SILENT_HOOKS,
        );

        expect(result).toBe(AGENT_RESULT);
        expect(dockerRunArgs(commands)).toContain(`${REPO_PATH}:/home/agent/workspace:ro`);
        expect(argsOf(commands, "git")).toEqual([]);
        expect(argsOf(commands, "docker").at(-1)).toEqual(["rm", "-f", CONTAINER_ID]);
    });

    it("removes the ephemeral container even when the agent fails", async () => {
        const commands = new FakeCommandRunner();
        scriptHealthyHost(commands);

        const running = createRuntime(commands).runHeadless(
            headlessSpec(),
            runRequest(),
            SILENT_HOOKS,
        );

        await expect(running).rejects.toBeInstanceOf(AgentRuntimeError);
        expect(argsOf(commands, "docker").at(-1)).toEqual(["rm", "-f", CONTAINER_ID]);
    });
});
