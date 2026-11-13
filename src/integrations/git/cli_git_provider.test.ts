import { CliGitProvider, parseGithubRepo } from "@/integrations/git/cli_git_provider.js";
import {
    BranchInUseError,
    GitCommandError,
    NotARepoError,
} from "@/integrations/git/git_provider.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";

const REPO_ROOT = "/repos/forja";
const SUBDIRECTORY = `${REPO_ROOT}/src/server`;

function scriptRepository(commands: FakeCommandRunner): void {
    commands.when("git", ["rev-parse", "--show-toplevel"]).returns({ stdout: REPO_ROOT });
    commands.when("git", ["branch", "--show-current"]).returns({ stdout: "feature/login" });
    commands
        .when("git", ["symbolic-ref", "refs/remotes/origin/HEAD"])
        .returns({ stdout: "refs/remotes/origin/trunk" });
    commands
        .when("git", ["remote", "get-url", "origin"])
        .returns({ stdout: "git@github.com:Fucks/forja.git" });
}

describe("parseGithubRepo", () => {
    it.each([
        "https://github.com/Fucks/forja",
        "https://github.com/Fucks/forja.git",
        "git@github.com:Fucks/forja",
        "git@github.com:Fucks/forja.git",
    ])("extracts owner/name from %s", (remoteUrl) => {
        expect(parseGithubRepo(remoteUrl)).toBe("Fucks/forja");
    });

    it.each(["https://gitlab.com/Fucks/forja.git", "git@bitbucket.org:Fucks/forja.git"])(
        "ignores the non-GitHub remote %s",
        (remoteUrl) => {
            expect(parseGithubRepo(remoteUrl)).toBeUndefined();
        },
    );
});

describe("CliGitProvider.inspectRepo", () => {
    it("describes the repository that contains the path", async () => {
        const commands = new FakeCommandRunner();
        scriptRepository(commands);

        const repoInfo = await new CliGitProvider(commands).inspectRepo(SUBDIRECTORY);

        expect(repoInfo).toEqual({
            root: REPO_ROOT,
            currentBranch: "feature/login",
            defaultBranch: "trunk",
            remoteUrl: "git@github.com:Fucks/forja.git",
            githubRepo: "Fucks/forja",
        });
    });

    it("asks git for the top level from the given path", async () => {
        const commands = new FakeCommandRunner();
        scriptRepository(commands);

        await new CliGitProvider(commands).inspectRepo(SUBDIRECTORY);

        expect(commands.calls[0]).toMatchObject({
            command: "git",
            args: ["rev-parse", "--show-toplevel"],
            options: { cwd: SUBDIRECTORY },
        });
    });

    it("falls back to main when origin has no HEAD", async () => {
        const commands = new FakeCommandRunner();
        scriptRepository(commands);
        commands.when("git", ["symbolic-ref", "refs/remotes/origin/HEAD"]).returns({ exitCode: 1 });

        const repoInfo = await new CliGitProvider(commands).inspectRepo(REPO_ROOT);

        expect(repoInfo.defaultBranch).toBe("main");
    });

    it("leaves the remote empty when there is no origin", async () => {
        const commands = new FakeCommandRunner();
        scriptRepository(commands);
        commands.when("git", ["remote", "get-url", "origin"]).returns({ exitCode: 2 });

        const repoInfo = await new CliGitProvider(commands).inspectRepo(REPO_ROOT);

        expect(repoInfo.remoteUrl).toBeUndefined();
        expect(repoInfo.githubRepo).toBeUndefined();
    });

    it("rejects a path outside any git repository with NotARepoError", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", ["rev-parse", "--show-toplevel"]).returns({ exitCode: 128 });

        const inspecting = new CliGitProvider(commands).inspectRepo("/tmp/solto");

        await expect(inspecting).rejects.toThrow(NotARepoError);
    });
});

describe("CliGitProvider.branchExists", () => {
    it("finds a local branch", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("git", ["show-ref", "--verify", "--quiet", "refs/heads/development"])
            .returns({ exitCode: 0 });

        const exists = await new CliGitProvider(commands).branchExists(REPO_ROOT, "development");

        expect(exists).toBe(true);
    });

    it("finds a branch that exists only on origin", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("git", ["show-ref", "--verify", "--quiet", "refs/remotes/origin/development"])
            .returns({ exitCode: 0 });

        const exists = await new CliGitProvider(commands).branchExists(REPO_ROOT, "development");

        expect(exists).toBe(true);
    });

    it("reports a branch missing locally and on origin", async () => {
        const commands = new FakeCommandRunner();

        const exists = await new CliGitProvider(commands).branchExists(REPO_ROOT, "development");

        expect(exists).toBe(false);
    });
});

describe("CliGitProvider.aheadBehind", () => {
    it("counts the commits of the branch ahead of and behind the base", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("git", ["rev-list", "--left-right", "--count", "origin/main...forja/issue-7"])
            .returns({ stdout: "2\t5\n" });

        const counts = await new CliGitProvider(commands).aheadBehind(
            REPO_ROOT,
            "forja/issue-7",
            "origin/main",
        );

        expect(counts).toEqual({ ahead: 5, behind: 2 });
    });

    it("rejects with GitCommandError when git cannot compare the branches", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("git", ["rev-list", "--left-right", "--count", "origin/main...forja/issue-7"])
            .returns({ exitCode: 128, stderr: "fatal: ambiguous argument" });

        const counting = new CliGitProvider(commands).aheadBehind(
            REPO_ROOT,
            "forja/issue-7",
            "origin/main",
        );

        await expect(counting).rejects.toThrow(GitCommandError);
    });
});

describe("CliGitProvider.push", () => {
    it("pushes the branch to origin with --force-with-lease and the given env", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("git", ["push", "--force-with-lease", "origin", "forja/issue-7"])
            .returns({ exitCode: 0 });

        await new CliGitProvider(commands).push(REPO_ROOT, "forja/issue-7", { GH_TOKEN: "ghp_x" });

        expect(commands.calls[0]).toMatchObject({
            args: ["push", "--force-with-lease", "origin", "forja/issue-7"],
            options: { cwd: REPO_ROOT, env: { GH_TOKEN: "ghp_x" } },
        });
    });

    it("never pushes with a plain --force", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("git", ["push", "--force-with-lease", "origin", "forja/issue-7"])
            .returns({ exitCode: 0 });

        await new CliGitProvider(commands).push(REPO_ROOT, "forja/issue-7", {});

        expect(commands.calls.flatMap((call) => call.args)).not.toContain("--force");
    });

    it("rejects with GitCommandError carrying the reason when the push fails", async () => {
        const commands = new FakeCommandRunner();
        commands
            .when("git", ["push", "--force-with-lease", "origin", "forja/issue-7"])
            .returns({ exitCode: 1, stderr: "! [rejected] (stale info)" });

        const pushing = new CliGitProvider(commands).push(REPO_ROOT, "forja/issue-7", {});

        await expect(pushing).rejects.toThrow(/stale info/);
    });
});

describe("CliGitProvider.deleteLocalBranch", () => {
    const LOCAL_BRANCH_REF = ["show-ref", "--verify", "--quiet", "refs/heads/forja/issue-7"];
    const DELETE_BRANCH = ["branch", "-D", "forja/issue-7"];

    it("force-deletes the local branch, since a squash merge leaves it unmerged for git", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", LOCAL_BRANCH_REF).returns({ exitCode: 0 });
        commands.when("git", DELETE_BRANCH).returns({ exitCode: 0 });

        const deleted = await new CliGitProvider(commands).deleteLocalBranch(
            REPO_ROOT,
            "forja/issue-7",
        );

        expect(deleted).toBe(true);
        expect(commands.calls.at(-1)).toMatchObject({
            args: DELETE_BRANCH,
            options: { cwd: REPO_ROOT },
        });
    });

    it("answers false without deleting anything when there is no local branch", async () => {
        const commands = new FakeCommandRunner();

        const deleted = await new CliGitProvider(commands).deleteLocalBranch(
            REPO_ROOT,
            "forja/issue-7",
        );

        expect(deleted).toBe(false);
        expect(commands.calls.map((call) => call.args)).not.toContainEqual(DELETE_BRANCH);
    });

    it("rejects with BranchInUseError when a worktree holds the branch", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", LOCAL_BRANCH_REF).returns({ exitCode: 0 });
        commands.when("git", DELETE_BRANCH).returns({
            exitCode: 1,
            stderr: "error: cannot delete branch 'forja/issue-7' used by worktree at '/wt/7'",
        });

        const deleting = new CliGitProvider(commands).deleteLocalBranch(REPO_ROOT, "forja/issue-7");

        await expect(deleting).rejects.toThrow(BranchInUseError);
    });

    it("rejects with GitCommandError when git fails for another reason", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", LOCAL_BRANCH_REF).returns({ exitCode: 0 });
        commands
            .when("git", DELETE_BRANCH)
            .returns({ exitCode: 128, stderr: "fatal: Unable to create '.git/packed-refs.lock'" });

        const deleting = new CliGitProvider(commands).deleteLocalBranch(REPO_ROOT, "forja/issue-7");

        await expect(deleting).rejects.toThrow(GitCommandError);
    });
});

describe("CliGitProvider.listWorktreePaths", () => {
    const LIST_WORKTREES = ["worktree", "list", "--porcelain"];

    it("lists the path of every worktree git knows about", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", LIST_WORKTREES).returns({
            stdout:
                `worktree ${REPO_ROOT}\nHEAD abc\nbranch refs/heads/main\n\n` +
                "worktree /wt/prj_1/forja__issue-7\nHEAD def\nbranch refs/heads/forja/issue-7\n",
        });

        const paths = await new CliGitProvider(commands).listWorktreePaths(REPO_ROOT);

        expect(paths).toEqual([REPO_ROOT, "/wt/prj_1/forja__issue-7"]);
        expect(commands.calls[0]?.options.cwd).toBe(REPO_ROOT);
    });

    it("rejects with GitCommandError when git fails", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", LIST_WORKTREES).returns({ exitCode: 128, stderr: "fatal: no repo" });

        const listing = new CliGitProvider(commands).listWorktreePaths(REPO_ROOT);

        await expect(listing).rejects.toThrow(GitCommandError);
    });
});

describe("CliGitProvider.pruneWorktrees", () => {
    const PRUNE_WORKTREES = ["worktree", "prune"];

    it("asks git to forget the worktrees whose directory is gone", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", PRUNE_WORKTREES).returns({});

        await new CliGitProvider(commands).pruneWorktrees(REPO_ROOT);

        expect(commands.calls.map((call) => call.args)).toEqual([PRUNE_WORKTREES]);
    });

    it("rejects with GitCommandError when git fails", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", PRUNE_WORKTREES).returns({ exitCode: 1, stderr: "fatal: locked" });

        const pruning = new CliGitProvider(commands).pruneWorktrees(REPO_ROOT);

        await expect(pruning).rejects.toThrow(GitCommandError);
    });
});
