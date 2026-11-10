import { GitCommandError, NotARepoError } from "@/integrations/git/git_provider.js";
import type { CommitCounts, GitProvider, RepoInfo } from "@/integrations/git/git_provider.js";
import { commandSucceeded } from "@/integrations/process/command_runner.js";
import type { CommandResult, CommandRunner } from "@/integrations/process/command_runner.js";

const GIT_TIMEOUT_MS = 10_000;
const PUSH_TIMEOUT_MS = 120_000;
const FALLBACK_DEFAULT_BRANCH = "main";
const ORIGIN_HEAD_REF = "refs/remotes/origin/HEAD";
const ORIGIN_BRANCH_PREFIX = "refs/remotes/origin/";
const LOCAL_BRANCH_PREFIX = "refs/heads/";
const COUNTS_SEPARATOR = /\s+/;
const GITHUB_REMOTE_PATTERN =
    /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

export class CliGitProvider implements GitProvider {
    constructor(private readonly commands: CommandRunner) {}

    async inspectRepo(path: string): Promise<RepoInfo> {
        const root = await this.findRepoRoot(path);
        const [currentBranch, defaultBranch, remoteUrl] = await Promise.all([
            this.readCurrentBranch(root),
            this.readDefaultBranch(root),
            this.readOriginUrl(root),
        ]);

        if (remoteUrl === undefined) {
            return { root, currentBranch, defaultBranch };
        }

        return {
            root,
            currentBranch,
            defaultBranch,
            remoteUrl,
            githubRepo: parseGithubRepo(remoteUrl),
        };
    }

    async branchExists(root: string, branch: string): Promise<boolean> {
        const [isLocal, isOnOrigin] = await Promise.all([
            this.refExists(root, `${LOCAL_BRANCH_PREFIX}${branch}`),
            this.refExists(root, `${ORIGIN_BRANCH_PREFIX}${branch}`),
        ]);

        return isLocal || isOnOrigin;
    }

    // A rebased branch no longer contains its remote copy, so the push has to be forced; the lease
    // keeps it from overwriting commits someone else pushed meanwhile.
    async push(root: string, branch: string, env: Record<string, string>): Promise<void> {
        const result = await this.commands.run(
            "git",
            ["push", "--force-with-lease", "origin", branch],
            { cwd: root, env, timeoutMs: PUSH_TIMEOUT_MS },
        );
        if (!commandSucceeded(result)) {
            throw new GitCommandError(`Não foi possível enviar o branch ${branch}`, result.stderr);
        }
    }

    async aheadBehind(root: string, branch: string, base: string): Promise<CommitCounts> {
        const range = `${base}...${branch}`;
        const result = await this.runGit(root, ["rev-list", "--left-right", "--count", range]);
        if (!commandSucceeded(result)) {
            throw new GitCommandError(
                `Não foi possível comparar ${branch} com ${base}`,
                result.stderr,
            );
        }

        const [behind = 0, ahead = 0] = result.stdout.trim().split(COUNTS_SEPARATOR).map(Number);
        return { ahead, behind };
    }

    private async findRepoRoot(path: string): Promise<string> {
        const result = await this.runGit(path, ["rev-parse", "--show-toplevel"]);
        if (!commandSucceeded(result)) {
            throw new NotARepoError(path);
        }

        return result.stdout.trim();
    }

    private async readCurrentBranch(root: string): Promise<string> {
        const result = await this.runGit(root, ["branch", "--show-current"]);
        return result.stdout.trim();
    }

    private async readDefaultBranch(root: string): Promise<string> {
        const result = await this.runGit(root, ["symbolic-ref", ORIGIN_HEAD_REF]);
        const originHead = result.stdout.trim();
        if (!commandSucceeded(result) || !originHead.startsWith(ORIGIN_BRANCH_PREFIX)) {
            return FALLBACK_DEFAULT_BRANCH;
        }

        return originHead.slice(ORIGIN_BRANCH_PREFIX.length);
    }

    private async readOriginUrl(root: string): Promise<string | undefined> {
        const result = await this.runGit(root, ["remote", "get-url", "origin"]);
        const remoteUrl = result.stdout.trim();
        if (!commandSucceeded(result) || remoteUrl === "") {
            return undefined;
        }

        return remoteUrl;
    }

    private async refExists(root: string, ref: string): Promise<boolean> {
        const result = await this.runGit(root, ["show-ref", "--verify", "--quiet", ref]);
        return commandSucceeded(result);
    }

    private runGit(cwd: string, args: string[]): Promise<CommandResult> {
        return this.commands.run("git", args, { cwd, timeoutMs: GIT_TIMEOUT_MS });
    }
}

export function parseGithubRepo(remoteUrl: string): string | undefined {
    const match = GITHUB_REMOTE_PATTERN.exec(remoteUrl);
    if (!match) {
        return undefined;
    }

    const [, owner, name] = match;
    return `${owner}/${name}`;
}
