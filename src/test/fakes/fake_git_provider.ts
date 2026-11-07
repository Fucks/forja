import { NotARepoError } from "@/integrations/git/git_provider.js";
import type { GitProvider, RepoInfo } from "@/integrations/git/git_provider.js";

export interface FakeRepoOptions {
    subdirectories?: string[];
    branches?: string[];
}

interface FakeRepo {
    repoInfo: RepoInfo;
    paths: string[];
    branches: string[];
}

export class FakeGitProvider implements GitProvider {
    private repos: FakeRepo[] = [];

    addRepo(repoInfo: RepoInfo, options: FakeRepoOptions = {}): void {
        const { subdirectories = [], branches = [] } = options;
        const repo = {
            repoInfo,
            paths: [repoInfo.root, ...subdirectories],
            branches: [repoInfo.currentBranch, repoInfo.defaultBranch, ...branches],
        };
        this.repos = [...this.repos, repo];
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
}
