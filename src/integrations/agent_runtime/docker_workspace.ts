import { assertCommandSucceeded } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
    RuntimeDir,
    Workspace,
} from "@/integrations/agent_runtime/agent_runtime.js";
import { execInContainer } from "@/integrations/agent_runtime/container_command.js";
import type { ContainerManager } from "@/integrations/agent_runtime/container_manager.js";
import { writeWorkspaceFiles } from "@/integrations/agent_runtime/workspace_files.js";
import type { CommandRunner } from "@/integrations/process/command_runner.js";

export interface OpenedWorkspace {
    id: string;
    branch: string;
    containerId: string;
    worktreePath: string;
    repoPath: string;
    runtimeDir: RuntimeDir;
    env: Record<string, string>;
}

export interface DockerWorkspaceDeps {
    commands: CommandRunner;
    containers: ContainerManager;
    runAgent: (request: AgentRunRequest, hooks: AgentRunHooks) => Promise<AgentRunResult>;
    closeWorkspace: (id: string) => Promise<void>;
}

const GIT_DIFF_TIMEOUT_MS = 60_000;
const DIFF_MAX_CHARS = 200 * 1024;
const DIFF_TRUNCATED_NOTICE = "\n… diff truncado em 200 KB";

export function createDockerWorkspace(
    opened: OpenedWorkspace,
    deps: DockerWorkspaceDeps,
): Workspace {
    const { commands, containers } = deps;

    async function runGitDiff(args: string[]): Promise<string> {
        const result = await commands.run("git", ["diff", ...args], {
            cwd: opened.worktreePath,
            timeoutMs: GIT_DIFF_TIMEOUT_MS,
        });
        assertCommandSucceeded(result, "Não foi possível calcular o diff do workspace");

        return result.stdout;
    }

    return {
        id: opened.id,
        branch: opened.branch,
        root: opened.worktreePath,
        runtimeDir: opened.runtimeDir,

        runAgent: deps.runAgent,

        exec: (command, options) =>
            execInContainer(
                { containerId: opened.containerId, containers, env: opened.env },
                command,
                options,
            ),

        async diff(baseBranch) {
            const range = `${baseBranch}...HEAD`;
            const [stat, patch] = await Promise.all([
                runGitDiff(["--stat", range]),
                runGitDiff([range]),
            ]);

            return truncateDiff(`${stat}\n\n${patch}`);
        },

        writeFiles: (files) => writeWorkspaceFiles(opened.worktreePath, files),

        close: () => deps.closeWorkspace(opened.id),
    };
}

function truncateDiff(diff: string): string {
    if (diff.length <= DIFF_MAX_CHARS) {
        return diff;
    }

    return `${diff.slice(0, DIFF_MAX_CHARS)}${DIFF_TRUNCATED_NOTICE}`;
}
