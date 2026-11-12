import { existsSync } from "node:fs";

import type { FastifyBaseLogger } from "fastify";

import { systemClock } from "@/lib/clock.js";
import { describeError } from "@/lib/describe_error.js";
import type { AppDeps } from "@/server/app.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { createGithubOfProject } from "@/server/work_items/project_github_provider.js";
import type { GithubOfProject } from "@/server/work_items/project_github_provider.js";
import { buildFailedSync, syncGithubIssues } from "@/server/work_items/github_sync.js";
import type { GithubSyncOptions, SyncResult } from "@/server/work_items/github_sync.js";
import { syncPullRequests } from "@/server/work_items/pull_request_sync.js";
import type { PullRequestSyncResult } from "@/server/work_items/pull_request_sync.js";
import { createSyncScheduler } from "@/server/work_items/sync_scheduler.js";
import type { SyncScheduler } from "@/server/work_items/sync_scheduler.js";
import type { WorkItemService } from "@/server/work_items/work_item_service.js";

const GITHUB_SYNC_INTERVAL_MS = 5 * 60_000;
const SYNC_FAILED_LOG_MESSAGE = "Falha ao sincronizar as issues do GitHub";
const PULL_REQUEST_SYNC_FAILED_LOG_MESSAGE = "Falha ao sincronizar os pull requests do GitHub";

export type SyncProject = (projectId: string, opts?: GithubSyncOptions) => Promise<SyncResult>;
export type SyncProjectPullRequests = (projectId: string) => Promise<PullRequestSyncResult>;

export interface ProjectGithubSyncDeps {
    appDeps: AppDeps;
    workItems: WorkItemService;
    log: FastifyBaseLogger;
}

export interface ProjectGithubSync {
    syncProject: SyncProject;
    syncProjectPullRequests: SyncProjectPullRequests;
    /**
     * Syncs the pull requests and then the issues of the projects that have a GitHub repository
     * every few minutes, logging failures.
     */
    scheduler: SyncScheduler;
}

interface LoggedSyncRequest {
    syncProject: SyncProject;
    log: FastifyBaseLogger;
    projectId: string;
}

interface LoggedPullRequestSyncRequest {
    syncProjectPullRequests: SyncProjectPullRequests;
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
    const githubOf = createGithubOfProject({ ...deps.appDeps, clock: systemClock });
    const syncProject = createSyncProject(deps, projects, githubOf);
    const syncProjectPullRequests = createSyncProjectPullRequests(deps, projects, githubOf);
    const { log } = deps;
    const scheduler = createSyncScheduler({
        clock: systemClock,
        intervalMs: GITHUB_SYNC_INTERVAL_MS,
        listProjectIds: () => listGithubProjectIds(projects),
        // Pull requests first, so the issues their merge closed reach the items in the same round.
        sync: async (projectId) => {
            await syncPullRequestsLoggingFailures({ syncProjectPullRequests, log, projectId });
            return syncLoggingFailures({ syncProject, log, projectId });
        },
    });

    return { syncProject, syncProjectPullRequests, scheduler };
}

function createSyncProject(
    deps: ProjectGithubSyncDeps,
    projects: ProjectService,
    githubOf: GithubOfProject,
): SyncProject {
    return async (projectId, opts) => {
        const github = await githubOf(projectId);
        const syncDeps = { projects, items: deps.workItems, github, clock: systemClock };
        return syncGithubIssues(projectId, syncDeps, opts);
    };
}

function createSyncProjectPullRequests(
    deps: ProjectGithubSyncDeps,
    projects: ProjectService,
    githubOf: GithubOfProject,
): SyncProjectPullRequests {
    const runs = new SqliteRunRepository(deps.appDeps.db, systemClock);

    return async (projectId) => {
        const github = await githubOf(projectId);
        const pullRequestSyncDeps = {
            runs,
            items: deps.workItems,
            github,
            git: deps.appDeps.git,
            projects,
            clock: systemClock,
        };
        return syncPullRequests(projectId, pullRequestSyncDeps);
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
        return buildFailedSync(systemClock.now().toISOString(), describeError(error));
    }
}

async function syncPullRequestsLoggingFailures({
    syncProjectPullRequests,
    log,
    projectId,
}: LoggedPullRequestSyncRequest): Promise<void> {
    try {
        await syncProjectPullRequests(projectId);
    } catch (error) {
        log.warn({ projectId, error: describeError(error) }, PULL_REQUEST_SYNC_FAILED_LOG_MESSAGE);
    }
}
