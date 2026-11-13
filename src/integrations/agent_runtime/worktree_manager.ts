import path from "node:path";

import { assertCommandSucceeded } from "@/integrations/agent_runtime/agent_errors.js";
import { CliGitProvider, parseWorktreePaths } from "@/integrations/git/cli_git_provider.js";
import { commandSucceeded } from "@/integrations/process/command_runner.js";
import type { CommandResult, CommandRunner } from "@/integrations/process/command_runner.js";

export interface EnsureWorktreeInput {
    repoPath: string;
    worktreesDir: string;
    branch: string;
    baseBranch: string;
}

export interface EnsuredWorktree {
    path: string;
    created: boolean;
}

export interface WorktreeManager {
    ensure(input: EnsureWorktreeInput): Promise<EnsuredWorktree>;
    /** Keeps the branch: only the worktree directory and its registration go away. */
    remove(repoPath: string, path: string): Promise<void>;
}

const GIT_WORKTREE_TIMEOUT_MS = 120_000;
const BRANCH_SEPARATOR = "/";
const BRANCH_SEPARATOR_IN_DIR_NAME = "__";

export function createWorktreeManager(commands: CommandRunner): WorktreeManager {
    const git = new CliGitProvider(commands);

    function runGit(repoPath: string, args: string[]): Promise<CommandResult> {
        return commands.run("git", args, { cwd: repoPath, timeoutMs: GIT_WORKTREE_TIMEOUT_MS });
    }

    async function isRegistered(repoPath: string, worktreePath: string): Promise<boolean> {
        const result = await runGit(repoPath, ["worktree", "list", "--porcelain"]);
        assertCommandSucceeded(result, "Não foi possível listar os worktrees do repositório");

        return parseWorktreePaths(result.stdout).some((registeredPath) =>
            isSamePath(registeredPath, worktreePath),
        );
    }

    async function addOnExistingBranch(
        input: EnsureWorktreeInput,
        worktreePath: string,
    ): Promise<void> {
        const result = await runGit(input.repoPath, [
            "worktree",
            "add",
            worktreePath,
            input.branch,
        ]);
        assertCommandSucceeded(
            result,
            `Não foi possível criar o worktree do branch ${input.branch}`,
        );
    }

    async function addOnNewBranch(input: EnsureWorktreeInput, worktreePath: string): Promise<void> {
        const { repoPath, branch, baseBranch } = input;
        const addArgs = ["worktree", "add", "-b", branch, worktreePath];

        const fromOriginBase = await runGit(repoPath, [...addArgs, `origin/${baseBranch}`]);
        if (commandSucceeded(fromOriginBase)) {
            return;
        }

        const fromLocalBase = await runGit(repoPath, [...addArgs, baseBranch]);
        assertCommandSucceeded(
            fromLocalBase,
            `Não foi possível criar o branch ${branch} a partir de ${baseBranch}`,
        );
    }

    return {
        async ensure(input) {
            const worktreePath = worktreePathFor(input.worktreesDir, input.branch);
            if (await isRegistered(input.repoPath, worktreePath)) {
                return { path: worktreePath, created: false };
            }

            if (await git.branchExists(input.repoPath, input.branch)) {
                await addOnExistingBranch(input, worktreePath);
            } else {
                await addOnNewBranch(input, worktreePath);
            }

            return { path: worktreePath, created: true };
        },

        async remove(repoPath, worktreePath) {
            if (await isRegistered(repoPath, worktreePath)) {
                const result = await runGit(repoPath, [
                    "worktree",
                    "remove",
                    "--force",
                    worktreePath,
                ]);
                assertCommandSucceeded(
                    result,
                    `Não foi possível remover o worktree ${worktreePath}`,
                );
            }

            const pruned = await runGit(repoPath, ["worktree", "prune"]);
            assertCommandSucceeded(pruned, "Não foi possível limpar a lista de worktrees");
        },
    };
}

/** Absolute path of the `.git` dir shared by the repository and all of its worktrees. */
export async function readGitCommonDir(commands: CommandRunner, repoPath: string): Promise<string> {
    const result = await commands.run("git", ["rev-parse", "--git-common-dir"], {
        cwd: repoPath,
        timeoutMs: GIT_WORKTREE_TIMEOUT_MS,
    });
    assertCommandSucceeded(result, `Não foi possível achar o diretório .git de ${repoPath}`);

    return path.resolve(repoPath, result.stdout.trim());
}

function worktreePathFor(worktreesDir: string, branch: string): string {
    const directoryName = branch.replaceAll(BRANCH_SEPARATOR, BRANCH_SEPARATOR_IN_DIR_NAME);
    return path.join(worktreesDir, directoryName);
}

function isSamePath(first: string, second: string): boolean {
    return path.resolve(first) === path.resolve(second);
}
