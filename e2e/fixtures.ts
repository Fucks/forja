import { rmSync } from "node:fs";

import { test as base } from "@playwright/test";

import {
    EDITOR_TOUR_DISMISSED_KEY,
    EDITOR_TOUR_DISMISSED_VALUE,
} from "@/web/canvas/editor_tour_storage.js";

import { localBasicFactoryFlow } from "./flow_graphs.js";
import type { PublishedFlowInput } from "./forja_api.js";
import { ForjaApi } from "./forja_api.js";
import { createTemporaryGitRepo, type TemporaryGitRepo } from "./temporary_git_repo.js";

export { expect } from "@playwright/test";

interface RunnableProject {
    id: string;
    flowId: string;
    /**
     * Gives each local item of the project its branch, as an agent of the real runtime would, and
     * returns the ids of the items.
     */
    prepareItemsToRun(): Promise<string[]>;
}

interface GithubProject {
    id: string;
    /** The one local item of the project, its branch already ahead of the base. */
    itemId: string;
}

interface ForjaFixtures {
    gitRepo: TemporaryGitRepo;
    forja: ForjaApi;
    projectFlow: PublishedFlowInput;
    runnableProject: RunnableProject;
    githubProject: GithubProject;
}

/** Enough for the simulated agents of the basic factory to finish a few items. */
export const RUN_TIMEOUT_MS = 90_000;

const PROJECT_NAME = "Repo E2E";
const GITHUB_PROJECT_ITEM_TITLE = "Cupom de desconto no checkout";

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
        const forja = await ForjaApi.openSession(request);
        await use(forja);
        await forja.scriptAgentOutputs([]);
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

    githubProject: async ({ gitRepo, forja }, use) => {
        gitRepo.connectToFakeGithub();
        const projectId = await forja.createProject({ name: PROJECT_NAME, repoPath: gitRepo.path });
        await forja.prepareSimulatedAgents(projectId);
        await forja.createLocalItem(projectId, GITHUB_PROJECT_ITEM_TITLE);
        const [item] = await forja.listWorkItems(projectId);
        if (!item) {
            throw new Error("The local item of the GitHub project was not created");
        }
        gitRepo.createBranchesAheadOfBase([item.branch]);

        await use({ id: projectId, itemId: item.id });
    },
});
