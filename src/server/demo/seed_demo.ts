import { existsSync } from "node:fs";

import type { Clock } from "@/lib/clock.js";
import type { AppDeps } from "@/server/app.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import { createCredentialService } from "@/server/credentials/credential_service.js";
import {
    createDemoGitRepo,
    createItemBranches,
    DEMO_BASE_BRANCH,
} from "@/server/demo/demo_git_repo.js";
import { publishDemoFlow } from "@/server/demo/demo_flow.js";
import { DemoMarker } from "@/server/demo/demo_marker.js";
import { runDemoFlowToTheEnd } from "@/server/demo/demo_run.js";
import { DEMO_ITEMS } from "@/server/demo/demo_script.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService, type SettingsService } from "@/server/settings/settings_service.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import { createWorkItemService } from "@/server/work_items/work_item_service.js";
import type { Project } from "@/shared/project_types.js";
import type { WorkItem } from "@/shared/work_item_types.js";

/** The pieces of the app the seed runs on, the same the routes and the executor use. */
export type AppServices = Pick<
    AppDeps,
    "db" | "events" | "logs" | "git" | "commands" | "secrets" | "redactor"
> & { clock: Clock };

export interface SeedDemoResult {
    created: boolean;
    projectId: string;
}

const DEMO_PROJECT_NAME = "Demo — loja de café";
const DEMO_CREDENTIAL_NAME = "Demo — chave fictícia";
const DEMO_CREDENTIAL_VALUE = "sk-ant-demo-forja-nao-e-uma-chave-real";

/** Creates the demo project with a finished run; does nothing when the demo was seeded before. */
export async function seedDemo(deps: AppServices): Promise<SeedDemoResult> {
    const marker = new DemoMarker(deps.db);
    const seededProjectId = findExistingDemoProjectId(deps, marker);
    if (seededProjectId !== undefined) {
        return { created: false, projectId: seededProjectId };
    }

    const project = await createDemoProject(deps);
    const items = await createDemoItems(deps, project.id);
    await createItemBranches(
        deps.commands,
        project.repoPath,
        items.map((item) => item.branch),
    );
    await assignDemoCredential(deps, project.id);
    await startAgentsWithoutPacing(deps);
    const flowId = await publishDemoFlow(deps, project.id);
    await runDemoFlowToTheEnd(deps, {
        projectId: project.id,
        flowId,
        itemIds: items.map((item) => item.id),
    });
    marker.markSeeded(project.id);

    return { created: true, projectId: project.id };
}

function findExistingDemoProjectId(deps: AppServices, marker: DemoMarker): string | undefined {
    const projectId = marker.findSeededProjectId();
    if (projectId === undefined || !new ProjectRepository(deps.db).findById(projectId)) {
        return undefined;
    }

    return projectId;
}

async function createDemoProject(deps: AppServices): Promise<Project> {
    const projects = createProjectService({
        repo: new ProjectRepository(deps.db),
        git: deps.git,
        fileExists: existsSync,
        clock: deps.clock,
    });
    const repoPath = await createDemoGitRepo(deps.commands);

    return projects.create({ name: DEMO_PROJECT_NAME, repoPath, baseBranch: DEMO_BASE_BRANCH });
}

async function createDemoItems(deps: AppServices, projectId: string): Promise<WorkItem[]> {
    const workItems = createWorkItemService({
        repo: new WorkItemRepository(deps.db),
        events: deps.events,
        clock: deps.clock,
    });
    const items: WorkItem[] = [];
    // One at a time, so the board lists them in the order of the demo.
    for (const item of DEMO_ITEMS) {
        items.push(await workItems.createLocal(projectId, { ...item, labels: [], blockedBy: [] }));
    }

    return items;
}

// The agents need a credential to start; the simulated ones never use it.
async function assignDemoCredential(deps: AppServices, projectId: string): Promise<void> {
    const credentials = createCredentialService({
        repo: new CredentialRepository(deps.db),
        secrets: deps.secrets,
        redactor: deps.redactor,
        clock: deps.clock,
    });
    const settings = createDemoSettingsService(deps);
    const [credential, projectSettings] = await Promise.all([
        credentials.create({
            name: DEMO_CREDENTIAL_NAME,
            kind: "anthropic_api_key",
            value: DEMO_CREDENTIAL_VALUE,
        }),
        settings.getProjectSettings(projectId),
    ]);

    await settings.saveProjectSettings(projectId, {
        ...projectSettings,
        defaultCredentialId: credential.id,
    });
}

// The pacing between agent starts protects the real Claude limits, which the simulated agents
// never reach; with it, a run of the demo would take minutes instead of seconds.
async function startAgentsWithoutPacing(deps: AppServices): Promise<void> {
    const settings = createDemoSettingsService(deps);
    const globalSettings = await settings.getGlobalSettings();

    await settings.saveGlobalSettings({ ...globalSettings, minStartIntervalMs: 0 });
}

function createDemoSettingsService(deps: AppServices): SettingsService {
    return createSettingsService({
        repo: new SettingsRepository(deps.db),
        lookups: createSettingsLookups(deps.db),
        clock: deps.clock,
    });
}
