export interface RepoInfo {
    root: string;
    currentBranch: string;
    defaultBranch: string;
    remoteUrl?: string;
    /** "owner/name" when the remote is on GitHub. */
    githubRepo?: string;
}

export interface CommitCounts {
    ahead: number;
    behind: number;
}

export interface GitProvider {
    /** @throws NotARepoError when the path is not inside a git repository. */
    inspectRepo(path: string): Promise<RepoInfo>;
    branchExists(root: string, branch: string): Promise<boolean>;
    /** Pushes to origin with `--force-with-lease`. @throws GitCommandError */
    push(root: string, branch: string, env: Record<string, string>): Promise<void>;
    /** Commits of `branch` missing from `base` (ahead) and the reverse (behind). @throws GitCommandError */
    aheadBehind(root: string, branch: string, base: string): Promise<CommitCounts>;
    /**
     * False when there is no local branch to delete.
     * @throws BranchInUseError when a worktree holds the branch; GitCommandError otherwise
     */
    deleteLocalBranch(root: string, branch: string): Promise<boolean>;
    /** The main worktree included. @throws GitCommandError */
    listWorktreePaths(root: string): Promise<string[]>;
    /** Forgets the worktrees whose directory is gone. @throws GitCommandError */
    pruneWorktrees(root: string): Promise<void>;
}

export class NotARepoError extends Error {
    constructor(readonly path: string) {
        super(`O caminho ${path} não é um repositório git.`);
        this.name = "NotARepoError";
    }
}

export class GitCommandError extends Error {
    constructor(
        message: string,
        readonly stderr: string,
    ) {
        super(`${message}: ${stderr.trim()}`);
        this.name = "GitCommandError";
    }
}

export class BranchInUseError extends GitCommandError {
    constructor(
        readonly branch: string,
        stderr: string,
    ) {
        super(`O branch ${branch} está em uso por um worktree`, stderr);
        this.name = "BranchInUseError";
    }
}
