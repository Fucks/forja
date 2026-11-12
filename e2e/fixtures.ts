import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test as base } from "@playwright/test";

import { localBasicFactoryFlow } from "./flow_graphs.js";
import type { PublishedFlowInput } from "./forja_api.js";
import { ForjaApi } from "./forja_api.js";

export { expect } from "@playwright/test";

export interface TemporaryGitRepo {
    path: string;
    createBranches(branches: string[]): void;
}

export interface RunnableProject {
    id: string;
    /** Gives each local item of the project its branch, as an agent of the real runtime would. */
    createItemBranches(): Promise<void>;
}

interface ForjaFixtures {
    gitRepo: TemporaryGitRepo;
    forja: ForjaApi;
    projectFlow: PublishedFlowInput;
    runnableProject: RunnableProject;
}

const BASE_BRANCH = "main";
const GIT_AUTHOR = ["-c", "user.name=Forja E2E", "-c", "user.email=e2e@forja.local"];

export const test = base.extend<ForjaFixtures>({
    gitRepo: async ({}, use) => {
        const repo = createTemporaryGitRepo();
        await use(repo);
        rmSync(repo.path, { recursive: true, force: true });
    },

    forja: async ({ request }, use) => {
        await use(new ForjaApi(request));
    },

    projectFlow: [localBasicFactoryFlow(), { option: true }],

    runnableProject: async ({ gitRepo, forja, projectFlow }, use) => {
        const projectId = await forja.createProject({ name: "Repo E2E", repoPath: gitRepo.path });
        await forja.prepareSimulatedAgents(projectId);
        await forja.publishDefaultFlow(projectId, projectFlow);

        await use({
            id: projectId,
            createItemBranches: async () => {
                const items = await forja.listWorkItems(projectId);
                gitRepo.createBranches(items.map((item) => item.branch));
            },
        });
    },
});

function createTemporaryGitRepo(): TemporaryGitRepo {
    const repoPath = mkdtempSync(path.join(tmpdir(), "forja-e2e-repo-"));
    const git = (args: string[]): void => {
        execFileSync("git", args, { cwd: repoPath, stdio: "ignore" });
    };

    git(["init", "-b", BASE_BRANCH]);
    git([...GIT_AUTHOR, "commit", "--allow-empty", "-m", "Primeiro commit"]);
    // The git node compares each item branch with origin/<base>, and the repo has no remote.
    git(["update-ref", `refs/remotes/origin/${BASE_BRANCH}`, "HEAD"]);

    return {
        path: repoPath,
        createBranches: (branches) =>
            branches.forEach((branch) => git(["branch", "--force", branch])),
    };
}
