import { existsSync } from "node:fs";

import type { FastifyBaseLogger } from "fastify";

import { createGhCliGitHubProvider } from "@/integrations/github/gh_cli_github_provider.js";
import { systemClock } from "@/lib/clock.js";
import type { AppDeps } from "@/server/app.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import { createCredentialService } from "@/server/credentials/credential_service.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import { resolveGithubEnv } from "@/server/work_items/github_env.js";
import type { GithubEnvDeps } from "@/server/work_items/github_env.js";
import { buildFailedSync, syncGithubIssues } from "@/server/work_items/github_sync.js";
import type { GithubSyncOptions, SyncResult } from "@/server/work_items/github_sync.js";
import { createSyncScheduler } from "@/server/work_items/sync_scheduler.js";
import type { SyncScheduler } from "@/server/work_items/sync_scheduler.js";
import type { WorkItemService } from "@/server/work_items/work_item_service.js";

const GITHUB_SYNC_INTERVAL_MS = 5 * 60_000;
const SYNC_FAILED_LOG_MESSAGE = "Falha ao sincronizar as issues do GitHub";

export type SyncProject = (projectId: string, opts?: GithubSyncOptions) => Promise<SyncResult>;

export interface ProjectGithubSyncDeps {
    appDeps: AppDeps;
    workItems: WorkItemService;
    log: FastifyBaseLogger;
}

export interface ProjectGithubSync {
    syncProject: SyncProject;
    /** Syncs the projects that have a GitHub repository every few minutes, logging failures. */
    scheduler: SyncScheduler;
}

interface LoggedSyncRequest {
    syncProject: SyncProject;
    log: FastifyBaseLogger;
    projectId: string;
}

export function createProjectGithubSync(deps: ProjectGithubSyncDeps): ProjectGithubSync {
    const projects = createProjectService({
        repo: new ProjectRepository(deps.appDeps.db),
        git: deps.appDeps.git,
        fileExists: existsSync,
        clock: systemClock,
    });
    const syncProject = createSyncProject(deps, projects);
    const scheduler = createSyncScheduler({
        clock: systemClock,
        intervalMs: GITHUB_SYNC_INTERVAL_MS,
        listProjectIds: () => listGithubProjectIds(projects),
        sync: (projectId) => syncLoggingFailures({ syncProject, log: deps.log, projectId }),
    });

    return { syncProject, scheduler };
}

function createSyncProject(deps: ProjectGithubSyncDeps, projects: ProjectService): SyncProject {
    const githubEnvDeps = createGithubEnvDeps(deps.appDeps);

    return async (projectId, opts) => {
        const env = await resolveGithubEnv(projectId, githubEnvDeps);
        const github = createGhCliGitHubProvider({ commands: deps.appDeps.commands, env });
        const syncDeps = { projects, items: deps.workItems, github, clock: systemClock };
        return syncGithubIssues(projectId, syncDeps, opts);
    };
}

function createGithubEnvDeps(appDeps: AppDeps): GithubEnvDeps {
    return {
        settings: createSettingsService({
            repo: new SettingsRepository(appDeps.db),
            lookups: createSettingsLookups(appDeps.db),
            clock: systemClock,
        }),
        credentials: createCredentialService({
            repo: new CredentialRepository(appDeps.db),
            secrets: appDeps.secrets,
            redactor: appDeps.redactor,
            clock: systemClock,
        }),
    };
}

async function listGithubProjectIds(projects: ProjectService): Promise<string[]> {
    const allProjects = await projects.list();
    return allProjects
        .filter((project) => project.githubRepo !== undefined)
        .map((project) => project.id);
}

// A project removed or a credential deleted between rounds must not stop the other projects.
async function syncLoggingFailures(request: LoggedSyncRequest): Promise<SyncResult> {
    const result = await syncCatchingErrors(request);
    if (result.error !== undefined) {
        request.log.warn(
            { projectId: request.projectId, error: result.error },
            SYNC_FAILED_LOG_MESSAGE,
        );
    }

    return result;
}

async function syncCatchingErrors({
    syncProject,
    projectId,
}: LoggedSyncRequest): Promise<SyncResult> {
    try {
        return await syncProject(projectId);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return buildFailedSync(systemClock.now().toISOString(), message);
    }
}
