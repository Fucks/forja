import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import type { AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { GitProvider } from "@/integrations/git/git_provider.js";
import type { Clock } from "@/lib/clock.js";
import { BYTES_PER_MB } from "@/lib/format.js";
import { planCleanup } from "@/server/maintenance/plan_cleanup.js";
import type {
    CleanupPlan,
    LogDirInfo,
    RetentionPolicy,
} from "@/server/maintenance/plan_cleanup.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import type { RunRepository } from "@/server/runs/run_repository.js";
import type { LogStore } from "@/server/runtime/log_store.js";
import type { SettingsService } from "@/server/settings/settings_service.js";
import type { Project } from "@/shared/project_types.js";

export interface CleanupDeps {
    logs: LogStore;
    runs: RunRepository;
    settings: Pick<SettingsService, "getGlobalSettings">;
    projects: Pick<ProjectService, "list">;
    git: GitProvider;
    clock: Clock;
    runtime: Pick<AgentRuntime, "listOpenWorkspaces" | "closeWorkspace">;
    /** Holds one directory of worktrees per project. */
    worktreesDir: string;
}

export interface CleanupReport {
    deletedRuns: number;
    freedBytes: number;
    prunedWorktrees: number;
}

export async function runCleanup(deps: CleanupDeps): Promise<CleanupReport> {
    const logsCleanup = await expireLogsPastRetention(deps);
    await closeWorkspacesOfInactiveRuns(deps);
    const prunedWorktrees = await removeOrphanedWorktrees(deps);

    return {
        deletedRuns: logsCleanup.deleteRunIds.length,
        freedBytes: logsCleanup.freedBytes,
        prunedWorktrees,
    };
}

async function expireLogsPastRetention(deps: CleanupDeps): Promise<CleanupPlan> {
    const [logDirs, policy] = await Promise.all([
        describeLogDirs(deps),
        readRetentionPolicy(deps.settings),
    ]);
    const plan = planCleanup(logDirs, policy, deps.clock.now());
    await Promise.all(plan.deleteRunIds.map((runId) => deps.logs.expireRun(runId)));

    return plan;
}

async function describeLogDirs(deps: CleanupDeps): Promise<LogDirInfo[]> {
    const [runLogSizes, activeRunIds] = await Promise.all([
        deps.logs.listRunLogSizes(),
        listActiveRunIds(deps.runs),
    ]);

    return Promise.all(
        runLogSizes.map(async ({ runId, bytes }) => {
            const run = await deps.runs.getRun(runId);
            return { runId, bytes, finishedAt: run?.finishedAt, active: activeRunIds.has(runId) };
        }),
    );
}

async function readRetentionPolicy(settings: CleanupDeps["settings"]): Promise<RetentionPolicy> {
    const { logRetentionDays, logMaxTotalMb } = await settings.getGlobalSettings();

    return { retentionDays: logRetentionDays, maxTotalBytes: logMaxTotalMb * BYTES_PER_MB };
}

// The workspaces are listed before the active runs: a run always exists before its workspace, so
// a run that starts meanwhile is already active by the time its workspace could be closed.
async function closeWorkspacesOfInactiveRuns(deps: CleanupDeps): Promise<void> {
    const openWorkspaces = await deps.runtime.listOpenWorkspaces();
    const activeRunIds = await listActiveRunIds(deps.runs);
    const leftoverWorkspaces = openWorkspaces.filter(
        (workspace) => !activeRunIds.has(workspace.runId),
    );

    await Promise.all(
        leftoverWorkspaces.map((workspace) => deps.runtime.closeWorkspace(workspace.id)),
    );
}

async function listActiveRunIds(runs: RunRepository): Promise<Set<string>> {
    const activeRuns = await runs.listActiveRuns();
    return new Set(activeRuns.map((run) => run.id));
}

async function removeOrphanedWorktrees(deps: CleanupDeps): Promise<number> {
    const projects = await deps.projects.list();
    const removedCounts = await Promise.all(
        projects.map((project) => removeOrphanedWorktreesOf(project, deps)),
    );

    return removedCounts.reduce((total, count) => total + count, 0);
}

// Every open workspace has a registered worktree, so only directories git no longer knows go away.
async function removeOrphanedWorktreesOf(project: Project, deps: CleanupDeps): Promise<number> {
    await deps.git.pruneWorktrees(project.repoPath);
    const worktreeDirs = await listSubdirectories(path.join(deps.worktreesDir, project.id));
    const registeredPaths = await deps.git.listWorktreePaths(project.repoPath);
    const registered = new Set(
        registeredPaths.map((registeredPath) => path.resolve(registeredPath)),
    );

    const orphanDirs = worktreeDirs.filter((dir) => !registered.has(path.resolve(dir)));
    await Promise.all(orphanDirs.map((dir) => rm(dir, { recursive: true, force: true })));

    return orphanDirs.length;
}

async function listSubdirectories(parentDir: string): Promise<string[]> {
    if (!existsSync(parentDir)) {
        return [];
    }

    const entries = await readdir(parentDir, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(parentDir, entry.name));
}
