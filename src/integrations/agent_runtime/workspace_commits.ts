import { assertCommandSucceeded } from "@/integrations/agent_runtime/agent_errors.js";
import type { CommandRunner } from "@/integrations/process/command_runner.js";

/** Reads the commits of the item worktree on the host. */
export interface WorkspaceCommits {
    readHead(): Promise<string>;
    /** Oldest first. */
    listCommitsSince(sha: string): Promise<{ sha: string }[]>;
}

const GIT_LOG_TIMEOUT_MS = 30_000;

export function createWorkspaceCommits(
    commands: CommandRunner,
    worktreePath: string,
): WorkspaceCommits {
    async function runGit(args: string[], failureMessage: string): Promise<string> {
        const result = await commands.run("git", args, {
            cwd: worktreePath,
            timeoutMs: GIT_LOG_TIMEOUT_MS,
        });
        assertCommandSucceeded(result, failureMessage);

        return result.stdout;
    }

    return {
        async readHead() {
            const head = await runGit(
                ["rev-parse", "HEAD"],
                "Não foi possível ler o HEAD do workspace",
            );
            return head.trim();
        },

        async listCommitsSince(sha) {
            const shas = await runGit(
                ["rev-list", "--reverse", `${sha}..HEAD`],
                "Não foi possível listar os commits do workspace",
            );

            return shas
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line !== "")
                .map((commitSha) => ({ sha: commitSha }));
        },
    };
}
