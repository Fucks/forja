import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AgentRunHooks, WorkspaceSpec } from "@/integrations/agent_runtime/agent_runtime.js";
import { createDockerAgentRuntime } from "@/integrations/agent_runtime/docker_agent_runtime.js";
import { ExecaCommandRunner } from "@/integrations/process/execa_command_runner.js";
import { systemClock } from "@/lib/clock.js";
import { resolvePaths } from "@/lib/paths.js";

const IMAGE = "node:22-bookworm-slim";
const BRANCH = "forja/issue-55";
const GIT_TIMEOUT_MS = 10_000;
const SETUP_TIMEOUT_MS = 300_000;
const TEST_TIMEOUT_MS = 600_000;
const GIT_IDENTITY = ["-c", "user.name=Forja", "-c", "user.email=forja@example.com"];
const SILENT_HOOKS: AgentRunHooks = { onEvent: () => undefined };

// The slim image has no git, and as root it would refuse the host-owned worktree without
// safe.directory; so the container keeps the image's root user and installs git in setup.
const INSTALL_GIT =
    "apt-get update -qq && apt-get install -y -qq git >/dev/null && " +
    "git config --global --add safe.directory '*'";

describe.skipIf(!process.env.FORJA_IT_DOCKER)("DockerAgentRuntime against real Docker", () => {
    const commands = new ExecaCommandRunner();
    let sandbox: string;
    let repoPath: string;

    async function runOnHost(command: string, args: string[], cwd = repoPath): Promise<string> {
        const result = await commands.run(command, args, { cwd, timeoutMs: GIT_TIMEOUT_MS });
        if (result.exitCode !== 0) {
            throw new Error(`${command} ${args.join(" ")} falhou: ${result.stderr}`);
        }

        return result.stdout;
    }

    function workspaceSpec(): WorkspaceSpec {
        return {
            projectId: "prj_it",
            runId: "run_it0000000001",
            workItemId: "itm_it0000000001",
            repoPath,
            branch: BRANCH,
            baseBranch: "main",
            image: IMAGE,
            env: {},
            setupCommands: [{ command: INSTALL_GIT, timeoutMs: SETUP_TIMEOUT_MS }],
            files: [{ path: ".forja/contexto.md", content: "issue 55" }],
        };
    }

    beforeEach(async () => {
        sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "forja-docker-it-")));
        repoPath = path.join(sandbox, "repo");
        await runOnHost("git", ["init", "--initial-branch=main", repoPath], sandbox);
        await runOnHost("git", [...GIT_IDENTITY, "commit", "--allow-empty", "-m", "inicial"]);
    });

    afterEach(() => {
        rmSync(sandbox, { recursive: true, force: true });
    });

    it(
        "opens a workspace where git works, writes files, and closes it keeping the branch",
        async () => {
            const runtime = createDockerAgentRuntime({
                commands,
                paths: resolvePaths(path.join(sandbox, "forja"), sandbox),
                clock: systemClock,
                hostUser: null,
            });

            const workspace = await runtime.openWorkspace(
                workspaceSpec(),
                SILENT_HOOKS,
                new AbortController().signal,
            );
            const status = await workspace.exec("git status", {
                timeoutMs: GIT_TIMEOUT_MS,
                signal: new AbortController().signal,
            });
            await workspace.writeFiles([{ path: "notas.md", content: "escrito pelo host" }]);
            const writtenFile = readFileSync(path.join(workspace.root, "notas.md"), "utf8");
            const listedWhileOpen = await runtime.listOpenWorkspaces();
            await workspace.close();

            expect(status.exitCode).toBe(0);
            expect(status.stdoutTail).toContain(`On branch ${BRANCH}`);
            expect(writtenFile).toBe("escrito pelo host");
            expect(listedWhileOpen.map((open) => open.id)).toContain(workspace.id);
            expect(await runtime.listOpenWorkspaces()).not.toContainEqual(
                expect.objectContaining({ id: workspace.id }),
            );
            expect(existsSync(workspace.root)).toBe(false);
            await expect(runOnHost("git", ["branch", "--list", BRANCH])).resolves.toContain(BRANCH);
        },
        TEST_TIMEOUT_MS,
    );
});
