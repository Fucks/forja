import { existsSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
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

// Every worktree is locked because the agent's container mounts it somewhere other than its host
// path: a `git worktree prune` run there sees the registered path as missing and drops the
// registration. A locked worktree is never pruned.
const LOCK_FLAG = "--lock";
const NO_CHECKOUT_FLAG = "--no-checkout";
const GIT_DIR_FILE = ".git";
const REATTACH_STAGING_PREFIX = ".reattach-";
const PORCELAIN_BLOCK_SEPARATOR = /\n\s*\n/;
const PORCELAIN_LOCKED_LINE = /^locked( |$)/m;

interface WorktreeRegistration {
    locked: boolean;
}

export function createWorktreeManager(commands: CommandRunner): WorktreeManager {
    const git = new CliGitProvider(commands);

    function runGit(cwd: string, args: string[]): Promise<CommandResult> {
        return commands.run("git", args, { cwd, timeoutMs: GIT_WORKTREE_TIMEOUT_MS });
    }

    async function findRegistration(
        repoPath: string,
        worktreePath: string,
    ): Promise<WorktreeRegistration | undefined> {
        const result = await runGit(repoPath, ["worktree", "list", "--porcelain"]);
        assertCommandSucceeded(result, "Não foi possível listar os worktrees do repositório");

        const block = result.stdout
            .split(PORCELAIN_BLOCK_SEPARATOR)
            .find((candidate) =>
                parseWorktreePaths(candidate).some((registeredPath) =>
                    isSamePath(registeredPath, worktreePath),
                ),
            );

        return block === undefined ? undefined : { locked: PORCELAIN_LOCKED_LINE.test(block) };
    }

    async function lock(repoPath: string, worktreePath: string): Promise<void> {
        const result = await runGit(repoPath, ["worktree", "lock", worktreePath]);
        assertCommandSucceeded(result, `Não foi possível travar o worktree ${worktreePath}`);
    }

    async function addOnExistingBranch(
        input: EnsureWorktreeInput,
        worktreePath: string,
        flags: string[],
    ): Promise<void> {
        const result = await runGit(input.repoPath, [
            "worktree",
            "add",
            ...flags,
            worktreePath,
            input.branch,
        ]);
        assertCommandSucceeded(
            result,
            `Não foi possível criar o worktree do branch ${input.branch}`,
        );
    }

    async function addOnNewBranch(
        input: EnsureWorktreeInput,
        worktreePath: string,
        flags: string[],
    ): Promise<void> {
        const { repoPath, branch, baseBranch } = input;
        const addArgs = ["worktree", "add", ...flags, "-b", branch, worktreePath];

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

    async function add(
        input: EnsureWorktreeInput,
        worktreePath: string,
        flags: string[],
    ): Promise<void> {
        if (await git.branchExists(input.repoPath, input.branch)) {
            await addOnExistingBranch(input, worktreePath, flags);
        } else {
            await addOnNewBranch(input, worktreePath, flags);
        }
    }

    // `git worktree add` refuses a directory that exists, so git registers an empty staging
    // directory with the same name and `repair` moves that registration onto the old directory,
    // keeping its files (uncommitted work, node_modules) as they are.
    async function reattach(input: EnsureWorktreeInput, worktreePath: string): Promise<void> {
        const stagingDir = await mkdtemp(path.join(input.worktreesDir, REATTACH_STAGING_PREFIX));
        const stagingPath = path.join(stagingDir, path.basename(worktreePath));

        try {
            await add(input, stagingPath, [LOCK_FLAG, NO_CHECKOUT_FLAG]);
            await copyFile(
                path.join(stagingPath, GIT_DIR_FILE),
                path.join(worktreePath, GIT_DIR_FILE),
            );

            const repaired = await runGit(input.repoPath, ["worktree", "repair", worktreePath]);
            assertCommandSucceeded(
                repaired,
                `Não foi possível registrar de novo o worktree ${worktreePath}`,
            );

            const indexed = await runGit(worktreePath, ["reset", "--quiet"]);
            assertCommandSucceeded(
                indexed,
                `Não foi possível recriar o índice do worktree ${worktreePath}`,
            );
        } finally {
            await rm(stagingDir, { recursive: true, force: true });
        }
    }

    return {
        async ensure(input) {
            const worktreePath = worktreePathFor(input.worktreesDir, input.branch);
            const registration = await findRegistration(input.repoPath, worktreePath);

            if (registration) {
                if (!registration.locked) {
                    await lock(input.repoPath, worktreePath);
                }
                return { path: worktreePath, created: false };
            }

            if (existsSync(worktreePath)) {
                await reattach(input, worktreePath);
                return { path: worktreePath, created: false };
            }

            await add(input, worktreePath, [LOCK_FLAG]);
            return { path: worktreePath, created: true };
        },

        async remove(repoPath, worktreePath) {
            if (await findRegistration(repoPath, worktreePath)) {
                // Passing --force twice is what lets git remove a locked worktree.
                const result = await runGit(repoPath, [
                    "worktree",
                    "remove",
                    "--force",
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
