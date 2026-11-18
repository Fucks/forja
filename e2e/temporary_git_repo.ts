import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TemporaryGitRepo {
    path: string;
    createBranches(branches: string[]): void;
    /** Each branch gets a commit of its own, so the Git node has something to push. */
    createBranchesAheadOfBase(branches: string[]): void;
    /**
     * Makes `origin` look like a GitHub repository, so the project opens its pull requests on the
     * fake `gh`; the pushes go to a local bare repository.
     */
    connectToFakeGithub(): void;
}

type Git = (args: string[]) => string;

const BASE_BRANCH = "main";
const GIT_AUTHOR = ["-c", "user.name=Forja E2E", "-c", "user.email=e2e@forja.local"];
const FAKE_GITHUB_REMOTE_URL = "https://github.com/forja-e2e/repo-e2e.git";
const PUSHED_REPO_DIR = path.join(".git", "fake-github.git");

export function createTemporaryGitRepo(): TemporaryGitRepo {
    const repoPath = mkdtempSync(path.join(tmpdir(), "forja-e2e-repo-"));
    const git = gitIn(repoPath);

    git(["init", "-b", BASE_BRANCH]);
    git([...GIT_AUTHOR, "commit", "--allow-empty", "-m", "Primeiro commit"]);
    // The git node compares each item branch with origin/<base>, and nothing is ever fetched.
    git(["update-ref", `refs/remotes/origin/${BASE_BRANCH}`, "HEAD"]);

    return {
        path: repoPath,
        createBranches: (branches) =>
            branches.forEach((branch) => git(["branch", "--force", branch])),
        createBranchesAheadOfBase: (branches) =>
            branches.forEach((branch) => createBranchAheadOfBase(git, branch)),
        connectToFakeGithub: () => connectToFakeGithub(git, repoPath),
    };
}

function gitIn(cwd: string): Git {
    return (args) =>
        execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function createBranchAheadOfBase(git: Git, branch: string): void {
    const commitArgs = ["commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", branch];
    const commit = git([...GIT_AUTHOR, ...commitArgs]).trim();
    git(["branch", "--force", branch, commit]);
}

function connectToFakeGithub(git: Git, repoPath: string): void {
    const pushedRepoPath = path.join(repoPath, PUSHED_REPO_DIR);
    git(["init", "--bare", pushedRepoPath]);
    git(["remote", "add", "origin", FAKE_GITHUB_REMOTE_URL]);
    git(["remote", "set-url", "--push", "origin", pushedRepoPath]);
}
