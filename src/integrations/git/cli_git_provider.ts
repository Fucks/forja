import { NotARepoError } from "@/integrations/git/git_provider.js";
import type { GitProvider, RepoInfo } from "@/integrations/git/git_provider.js";
import type { CommandResult, CommandRunner } from "@/integrations/process/command_runner.js";

const GIT_TIMEOUT_MS = 10_000;
const FALLBACK_DEFAULT_BRANCH = "main";
const ORIGIN_HEAD_REF = "refs/remotes/origin/HEAD";
const ORIGIN_BRANCH_PREFIX = "refs/remotes/origin/";
const LOCAL_BRANCH_PREFIX = "refs/heads/";
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

    private async findRepoRoot(path: string): Promise<string> {
        const result = await this.git(path, ["rev-parse", "--show-toplevel"]);
        if (!succeeded(result)) {
            throw new NotARepoError(path);
        }

        return result.stdout.trim();
    }

    private async readCurrentBranch(root: string): Promise<string> {
        const result = await this.git(root, ["branch", "--show-current"]);
        return result.stdout.trim();
    }

    private async readDefaultBranch(root: string): Promise<string> {
        const result = await this.git(root, ["symbolic-ref", ORIGIN_HEAD_REF]);
        const originHead = result.stdout.trim();
        if (!succeeded(result) || !originHead.startsWith(ORIGIN_BRANCH_PREFIX)) {
            return FALLBACK_DEFAULT_BRANCH;
        }

        return originHead.slice(ORIGIN_BRANCH_PREFIX.length);
    }

    private async readOriginUrl(root: string): Promise<string | undefined> {
        const result = await this.git(root, ["remote", "get-url", "origin"]);
        const remoteUrl = result.stdout.trim();
        if (!succeeded(result) || remoteUrl === "") {
            return undefined;
        }

        return remoteUrl;
    }

    private async refExists(root: string, ref: string): Promise<boolean> {
        const result = await this.git(root, ["show-ref", "--verify", "--quiet", ref]);
        return succeeded(result);
    }

    private git(cwd: string, args: string[]): Promise<CommandResult> {
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

function succeeded(result: CommandResult): boolean {
    return result.exitCode === 0 && !result.timedOut;
}
