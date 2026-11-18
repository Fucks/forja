import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test as base } from "@playwright/test";

import {
    EDITOR_TOUR_DISMISSED_KEY,
    EDITOR_TOUR_DISMISSED_VALUE,
} from "@/web/canvas/editor_tour_storage.js";

import { localBasicFactoryFlow } from "./flow_graphs.js";
import type { PublishedFlowInput } from "./forja_api.js";
import { ForjaApi } from "./forja_api.js";

export { expect } from "@playwright/test";

interface TemporaryGitRepo {
    path: string;
    createBranches(branches: string[]): void;
}

interface RunnableProject {
    id: string;
    flowId: string;
    /**
     * Gives each local item of the project its branch, as an agent of the real runtime would, and
     * returns the ids of the items.
     */
    prepareItemsToRun(): Promise<string[]>;
}

interface ForjaFixtures {
    gitRepo: TemporaryGitRepo;
    forja: ForjaApi;
    projectFlow: PublishedFlowInput;
    runnableProject: RunnableProject;
}

/** Enough for the simulated agents of the basic factory to finish a few items. */
export const RUN_TIMEOUT_MS = 90_000;

const PROJECT_NAME = "Repo E2E";
const BASE_BRANCH = "main";
const GIT_AUTHOR = ["-c", "user.name=Forja E2E", "-c", "user.email=e2e@forja.local"];

export const test = base.extend<ForjaFixtures>({
    // The editor tour would cover the editor on its first opening; the specs drive the editor itself.
    page: async ({ page }, use) => {
        await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
            EDITOR_TOUR_DISMISSED_KEY,
            EDITOR_TOUR_DISMISSED_VALUE,
        ] as const);
        await use(page);
    },

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
        const projectId = await forja.createProject({ name: PROJECT_NAME, repoPath: gitRepo.path });
        await forja.prepareSimulatedAgents(projectId);
        const flowId = await forja.publishDefaultFlow(projectId, projectFlow);

        await use({
            id: projectId,
            flowId,
            prepareItemsToRun: async () => {
                const items = await forja.listWorkItems(projectId);
                gitRepo.createBranches(items.map((item) => item.branch));

                return items.map((item) => item.id);
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
