import {
    existsSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createWorktreeManager } from "@/integrations/agent_runtime/worktree_manager.js";
import { ExecaCommandRunner } from "@/integrations/process/execa_command_runner.js";

const BRANCH = "forja/issue-31";
const GIT_TIMEOUT_MS = 10_000;
const GIT_IDENTITY = ["-c", "user.name=Forja", "-c", "user.email=forja@example.com"];

describe("WorktreeManager against real git", () => {
    const commands = new ExecaCommandRunner();
    const worktrees = createWorktreeManager(commands);
    let sandbox: string;
    let repoPath: string;
    let worktreesDir: string;

    async function git(args: string[], cwd = repoPath): Promise<string> {
        const result = await commands.run("git", args, { cwd, timeoutMs: GIT_TIMEOUT_MS });
        if (result.exitCode !== 0) {
            throw new Error(`git ${args.join(" ")} falhou: ${result.stderr}`);
        }

        return result.stdout;
    }

    function ensure() {
        return worktrees.ensure({ repoPath, worktreesDir, branch: BRANCH, baseBranch: "main" });
    }

    beforeEach(async () => {
        sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "forja-worktree-it-")));
        repoPath = path.join(sandbox, "repo");
        worktreesDir = path.join(sandbox, "worktrees", "prj_it");
        await git(["init", "--initial-branch=main", repoPath], sandbox);
        writeFileSync(path.join(repoPath, "README.md"), "inicial\n");
        await git(["add", "README.md"]);
        await git([...GIT_IDENTITY, "commit", "-m", "inicial"]);
    });

    afterEach(() => {
        rmSync(sandbox, { recursive: true, force: true });
    });

    it("keeps the registration when a prune runs where the worktree path does not exist", async () => {
        const { path: worktreePath } = await ensure();
        const hiddenPath = `${worktreePath}.hidden`;

        renameSync(worktreePath, hiddenPath);
        await git(["worktree", "prune"]);
        renameSync(hiddenPath, worktreePath);

        expect(await git(["status", "--porcelain"], worktreePath)).toBe("");
        await expect(ensure()).resolves.toEqual({ path: worktreePath, created: false });
    });

    it("re-registers a worktree whose registration was pruned, keeping its uncommitted work", async () => {
        const { path: worktreePath } = await ensure();
        writeFileSync(path.join(worktreePath, "README.md"), "em andamento\n");
        rmSync(path.join(repoPath, ".git", "worktrees"), { recursive: true, force: true });

        const worktree = await ensure();

        expect(worktree).toEqual({ path: worktreePath, created: false });
        expect(await git(["status", "--porcelain"], worktreePath)).toBe(" M README.md");
        expect(readFileSync(path.join(worktreePath, "README.md"), "utf8")).toBe("em andamento\n");
        expect(await git(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath)).toBe(BRANCH);
        expect(await git(["worktree", "list", "--porcelain"])).toContain("locked");
    });

    it("removes a locked worktree and keeps its branch", async () => {
        const { path: worktreePath } = await ensure();

        await worktrees.remove(repoPath, worktreePath);

        expect(existsSync(worktreePath)).toBe(false);
        expect(await git(["branch", "--list", BRANCH])).toContain(BRANCH);
    });
});
