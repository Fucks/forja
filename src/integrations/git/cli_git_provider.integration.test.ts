import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { CliGitProvider } from "@/integrations/git/cli_git_provider.js";
import { NotARepoError } from "@/integrations/git/git_provider.js";
import { ExecaCommandRunner } from "@/integrations/process/execa_command_runner.js";

const GIT_TIMEOUT_MS = 10_000;
const GIT_IDENTITY = ["-c", "user.name=Forja", "-c", "user.email=forja@example.com"];

describe("CliGitProvider against a real repository", () => {
    const commands = new ExecaCommandRunner();
    const git = new CliGitProvider(commands);
    let workspace: string;
    let repoRoot: string;

    async function runGit(args: string[]): Promise<void> {
        const result = await commands.run("git", args, {
            cwd: repoRoot,
            timeoutMs: GIT_TIMEOUT_MS,
        });
        if (result.exitCode !== 0) {
            throw new Error(`git ${args.join(" ")} falhou: ${result.stderr}`);
        }
    }

    beforeEach(async () => {
        workspace = realpathSync(mkdtempSync(path.join(tmpdir(), "forja-git-")));
        repoRoot = path.join(workspace, "repo");
        mkdirSync(path.join(repoRoot, "src"), { recursive: true });
        await runGit(["init", "--initial-branch=main"]);
        await runGit([...GIT_IDENTITY, "commit", "--allow-empty", "-m", "inicial"]);
    });

    afterEach(() => {
        rmSync(workspace, { recursive: true, force: true });
    });

    it("finds the repository root and the current branch from a subdirectory", async () => {
        const repoInfo = await git.inspectRepo(path.join(repoRoot, "src"));

        expect(repoInfo).toEqual({ root: repoRoot, currentBranch: "main", defaultBranch: "main" });
    });

    it("reads the GitHub repository from the origin remote", async () => {
        await runGit(["remote", "add", "origin", "git@github.com:Fucks/forja.git"]);

        const repoInfo = await git.inspectRepo(repoRoot);

        expect(repoInfo.remoteUrl).toBe("git@github.com:Fucks/forja.git");
        expect(repoInfo.githubRepo).toBe("Fucks/forja");
    });

    it("tells whether a local branch exists", async () => {
        await runGit(["branch", "development"]);

        await expect(git.branchExists(repoRoot, "development")).resolves.toBe(true);
        await expect(git.branchExists(repoRoot, "release")).resolves.toBe(false);
    });

    it("rejects a directory outside any repository with NotARepoError", async () => {
        const looseDirectory = path.join(workspace, "solto");
        mkdirSync(looseDirectory);

        await expect(git.inspectRepo(looseDirectory)).rejects.toThrow(NotARepoError);
    });
});
