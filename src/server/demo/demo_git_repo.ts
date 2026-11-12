import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { commandSucceeded, type CommandRunner } from "@/integrations/process/command_runner.js";

export const DEMO_BASE_BRANCH = "main";

const DEMO_REPO_PREFIX = "forja-demo-";
const GIT_TIMEOUT_MS = 30_000;
const DEMO_COMMIT_MESSAGE = "Loja de café: primeiro commit";
const DEMO_AUTHOR = ["-c", "user.name=Forja", "-c", "user.email=demo@forja.local"];

export class DemoRepoError extends Error {
    override readonly name = "DemoRepoError";

    constructor(command: string, stderr: string) {
        super(
            `Não foi possível preparar o repositório da demonstração (git ${command}): ${stderr}`,
        );
    }
}

/** A fresh repository in a temporary directory, with one commit on the base branch. */
export async function createDemoGitRepo(commands: CommandRunner): Promise<string> {
    const repoPath = mkdtempSync(path.join(tmpdir(), DEMO_REPO_PREFIX));
    await runGit(commands, repoPath, ["init", "-b", DEMO_BASE_BRANCH]);
    await runGit(commands, repoPath, [
        ...DEMO_AUTHOR,
        "commit",
        "--allow-empty",
        "-m",
        DEMO_COMMIT_MESSAGE,
    ]);
    await markBaseAsPublished(commands, repoPath);

    return repoPath;
}

// The git node compares each branch with origin/<base>; the demo has no remote to fetch it from.
function markBaseAsPublished(commands: CommandRunner, repoPath: string): Promise<void> {
    return runGit(commands, repoPath, [
        "update-ref",
        `refs/remotes/origin/${DEMO_BASE_BRANCH}`,
        "HEAD",
    ]);
}

// The simulated agents commit nothing, so each item branch stays at the base and opens no PR.
export async function createItemBranches(
    commands: CommandRunner,
    repoPath: string,
    branches: string[],
): Promise<void> {
    for (const branch of branches) {
        await runGit(commands, repoPath, ["branch", branch]);
    }
}

async function runGit(commands: CommandRunner, repoPath: string, args: string[]): Promise<void> {
    const result = await commands.run("git", args, { cwd: repoPath, timeoutMs: GIT_TIMEOUT_MS });
    if (!commandSucceeded(result)) {
        throw new DemoRepoError(args.join(" "), result.stderr.trim());
    }
}
