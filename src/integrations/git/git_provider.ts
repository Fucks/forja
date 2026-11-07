export interface RepoInfo {
    root: string;
    currentBranch: string;
    defaultBranch: string;
    remoteUrl?: string;
    /** "owner/name" when the remote is on GitHub. */
    githubRepo?: string;
}

export interface GitProvider {
    /** @throws NotARepoError when the path is not inside a git repository. */
    inspectRepo(path: string): Promise<RepoInfo>;
    branchExists(root: string, branch: string): Promise<boolean>;
}

export class NotARepoError extends Error {
    constructor(readonly path: string) {
        super(`O caminho ${path} não é um repositório git.`);
        this.name = "NotARepoError";
    }
}
