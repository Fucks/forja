import { BranchInUseError, NotARepoError } from "@/integrations/git/git_provider.js";
import type { CommitCounts, GitProvider, RepoInfo } from "@/integrations/git/git_provider.js";

export interface FakeRepoOptions {
    subdirectories?: string[];
    branches?: string[];
}

export interface FakePush {
    root: string;
    branch: string;
    env: Record<string, string>;
}

interface FakeRepo {
    repoInfo: RepoInfo;
    paths: string[];
    branches: string[];
}

// A branch has no commits ahead of its base until a test says otherwise.
export class FakeGitProvider implements GitProvider {
    readonly pushes: FakePush[] = [];
    private repos: FakeRepo[] = [];
    private readonly commitsAheadByBranch = new Map<string, number>();
    private readonly branchesInWorktrees = new Set<string>();

    addRepo(repoInfo: RepoInfo, options: FakeRepoOptions = {}): void {
        const { subdirectories = [], branches = [] } = options;
        const repo = {
            repoInfo,
            paths: [repoInfo.root, ...subdirectories],
            branches: [repoInfo.currentBranch, repoInfo.defaultBranch, ...branches],
        };
        this.repos = [...this.repos, repo];
    }

    setCommitsAhead(branch: string, commitsAhead: number): void {
        this.commitsAheadByBranch.set(branch, commitsAhead);
    }

    holdBranchInWorktree(branch: string): void {
        this.branchesInWorktrees.add(branch);
    }

    inspectRepo(path: string): Promise<RepoInfo> {
        const repo = this.repos.find((candidate) => candidate.paths.includes(path));
        if (!repo) {
            return Promise.reject(new NotARepoError(path));
        }

        return Promise.resolve(repo.repoInfo);
    }

    branchExists(root: string, branch: string): Promise<boolean> {
        const repo = this.repos.find((candidate) => candidate.repoInfo.root === root);
        return Promise.resolve(repo?.branches.includes(branch) ?? false);
    }

    push(root: string, branch: string, env: Record<string, string>): Promise<void> {
        this.pushes.push({ root, branch, env });
        return Promise.resolve();
    }

    aheadBehind(_root: string, branch: string): Promise<CommitCounts> {
        const ahead = this.commitsAheadByBranch.get(branch) ?? 0;
        return Promise.resolve({ ahead, behind: 0 });
    }

    deleteLocalBranch(root: string, branch: string): Promise<boolean> {
        if (this.branchesInWorktrees.has(branch)) {
            return Promise.reject(new BranchInUseError(branch, "used by worktree"));
        }

        const repo = this.repos.find((candidate) => candidate.repoInfo.root === root);
        if (!repo?.branches.includes(branch)) {
            return Promise.resolve(false);
        }

        const repoWithoutBranch = {
            ...repo,
            branches: repo.branches.filter((existing) => existing !== branch),
        };
        this.repos = this.repos.map((candidate) =>
            candidate === repo ? repoWithoutBranch : candidate,
        );
        return Promise.resolve(true);
    }
}
