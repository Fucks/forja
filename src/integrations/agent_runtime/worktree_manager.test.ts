import path from "node:path";

import { WorkspaceError } from "@/integrations/agent_runtime/agent_errors.js";
import { createWorktreeManager } from "@/integrations/agent_runtime/worktree_manager.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";

const REPO_PATH = "/repos/forja";
const WORKTREES_DIR = "/home/ana/.forja/worktrees/prj_1";
const BRANCH = "forja/issue-7";
const WORKTREE_PATH = path.join(WORKTREES_DIR, "forja__issue-7");
const ENSURE_INPUT = {
    repoPath: REPO_PATH,
    worktreesDir: WORKTREES_DIR,
    branch: BRANCH,
    baseBranch: "main",
};

function scriptRegisteredWorktrees(commands: FakeCommandRunner, worktreePaths: string[]): void {
    const porcelain = worktreePaths
        .map((worktreePath) => `worktree ${worktreePath}\nHEAD abc123\nbranch refs/heads/x\n`)
        .join("\n");
    commands.when("git", ["worktree", "list", "--porcelain"]).returns({ stdout: porcelain });
}

function scriptLocalBranch(commands: FakeCommandRunner, branch: string): void {
    commands.when("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).returns({});
}

function gitArgs(commands: FakeCommandRunner): string[][] {
    return commands.calls.map((call) => call.args);
}

describe("WorktreeManager.ensure", () => {
    it("adds a worktree on the existing branch, named after the branch with / as __", async () => {
        const commands = new FakeCommandRunner();
        scriptRegisteredWorktrees(commands, [REPO_PATH]);
        scriptLocalBranch(commands, BRANCH);
        commands.when("git", ["worktree", "add", WORKTREE_PATH, BRANCH]).returns({});

        const worktree = await createWorktreeManager(commands).ensure(ENSURE_INPUT);

        expect(worktree).toEqual({ path: WORKTREE_PATH, created: true });
        expect(commands.calls.at(-1)).toMatchObject({
            command: "git",
            args: ["worktree", "add", WORKTREE_PATH, BRANCH],
            options: { cwd: REPO_PATH },
        });
    });

    it("uses a branch that exists only on origin", async () => {
        const commands = new FakeCommandRunner();
        scriptRegisteredWorktrees(commands, [REPO_PATH]);
        commands
            .when("git", ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${BRANCH}`])
            .returns({});
        commands.when("git", ["worktree", "add", WORKTREE_PATH, BRANCH]).returns({});

        const worktree = await createWorktreeManager(commands).ensure(ENSURE_INPUT);

        expect(worktree.created).toBe(true);
    });

    it("creates a new branch from origin/<base> when the branch does not exist", async () => {
        const commands = new FakeCommandRunner();
        scriptRegisteredWorktrees(commands, [REPO_PATH]);
        commands
            .when("git", ["worktree", "add", "-b", BRANCH, WORKTREE_PATH, "origin/main"])
            .returns({});

        const worktree = await createWorktreeManager(commands).ensure(ENSURE_INPUT);

        expect(worktree).toEqual({ path: WORKTREE_PATH, created: true });
        expect(gitArgs(commands).at(-1)).toEqual([
            "worktree",
            "add",
            "-b",
            BRANCH,
            WORKTREE_PATH,
            "origin/main",
        ]);
    });

    it("falls back to the local base when origin/<base> does not exist", async () => {
        const commands = new FakeCommandRunner();
        scriptRegisteredWorktrees(commands, [REPO_PATH]);
        commands.when("git", ["worktree", "add", "-b", BRANCH, WORKTREE_PATH, "main"]).returns({});

        const worktree = await createWorktreeManager(commands).ensure(ENSURE_INPUT);

        expect(worktree).toEqual({ path: WORKTREE_PATH, created: true });
    });

    it("reuses the worktree already registered at the same path", async () => {
        const commands = new FakeCommandRunner();
        scriptRegisteredWorktrees(commands, [REPO_PATH, WORKTREE_PATH]);

        const worktree = await createWorktreeManager(commands).ensure(ENSURE_INPUT);

        expect(worktree).toEqual({ path: WORKTREE_PATH, created: false });
        expect(gitArgs(commands)).toEqual([["worktree", "list", "--porcelain"]]);
    });

    it("throws a WorkspaceError with git's message when no worktree can be added", async () => {
        const commands = new FakeCommandRunner();
        scriptRegisteredWorktrees(commands, [REPO_PATH]);
        commands
            .when("git", ["worktree", "add", "-b", BRANCH, WORKTREE_PATH, "main"])
            .returns({ exitCode: 128, stderr: "fatal: invalid reference: main" });

        const ensuring = createWorktreeManager(commands).ensure(ENSURE_INPUT);

        await expect(ensuring).rejects.toBeInstanceOf(WorkspaceError);
        await expect(ensuring).rejects.toThrow("fatal: invalid reference: main");
    });
});

describe("WorktreeManager.remove", () => {
    it("force-removes the registered worktree and prunes the list", async () => {
        const commands = new FakeCommandRunner();
        scriptRegisteredWorktrees(commands, [REPO_PATH, WORKTREE_PATH]);
        commands.when("git", ["worktree", "remove", "--force", WORKTREE_PATH]).returns({});
        commands.when("git", ["worktree", "prune"]).returns({});

        await createWorktreeManager(commands).remove(REPO_PATH, WORKTREE_PATH);

        expect(gitArgs(commands)).toEqual([
            ["worktree", "list", "--porcelain"],
            ["worktree", "remove", "--force", WORKTREE_PATH],
            ["worktree", "prune"],
        ]);
    });

    it("only prunes when the worktree was already removed", async () => {
        const commands = new FakeCommandRunner();
        scriptRegisteredWorktrees(commands, [REPO_PATH]);
        commands.when("git", ["worktree", "prune"]).returns({});

        await createWorktreeManager(commands).remove(REPO_PATH, WORKTREE_PATH);

        expect(gitArgs(commands)).toEqual([
            ["worktree", "list", "--porcelain"],
            ["worktree", "prune"],
        ]);
    });

    it("throws a WorkspaceError when git cannot remove the worktree", async () => {
        const commands = new FakeCommandRunner();
        scriptRegisteredWorktrees(commands, [REPO_PATH, WORKTREE_PATH]);
        commands
            .when("git", ["worktree", "remove", "--force", WORKTREE_PATH])
            .returns({ exitCode: 128, stderr: "fatal: permission denied" });

        const removing = createWorktreeManager(commands).remove(REPO_PATH, WORKTREE_PATH);

        await expect(removing).rejects.toThrow(WorkspaceError);
    });
});
