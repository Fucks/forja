import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AgentEvent } from "@/integrations/agent_runtime/agent_runtime.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { runCleanup, type CleanupDeps } from "@/server/maintenance/cleanup_service.js";
import type { RunStatusName } from "@/shared/events.js";
import type { Project } from "@/shared/project_types.js";
import { DEFAULT_GLOBAL_SETTINGS, type GlobalSettings } from "@/shared/settings_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildRunRecord } from "@/test/factories/run_record_factory.js";
import { FakeAgentRuntime } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { InMemoryRunRepository } from "@/test/fakes/in_memory_run_repository.js";
import { createTestDb } from "@/test/test_db.js";
import { createTestLogStore } from "@/test/test_log_store.js";

const NOW = new Date("2026-11-13T03:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const BYTES_PER_MB = 1024 * 1024;
const PROJECT = buildProject({ id: "prj_forja" });

function daysAgo(days: number): Date {
    return new Date(NOW.getTime() - days * DAY_MS);
}

function textEvent(text: string): AgentEvent {
    return { kind: "text", text, at: NOW, iteration: 1 };
}

describe("runCleanup", () => {
    let database: DatabaseHandle;
    let worktreesDir: string;
    let clock: FakeClock;
    let runs: InMemoryRunRepository;
    let git: FakeGitProvider;
    let runtime: FakeAgentRuntime;
    let globalSettings: GlobalSettings;
    let projects: Project[];
    let deps: CleanupDeps;

    beforeEach(() => {
        database = createTestDb();
        worktreesDir = mkdtempSync(path.join(tmpdir(), "forja-worktrees-"));
        clock = new FakeClock(NOW);
        runs = new InMemoryRunRepository();
        git = new FakeGitProvider();
        runtime = new FakeAgentRuntime({ clock });
        globalSettings = DEFAULT_GLOBAL_SETTINGS;
        projects = [PROJECT];
        deps = {
            logs: createTestLogStore(database.db, clock),
            runs,
            settings: { getGlobalSettings: () => Promise.resolve(globalSettings) },
            projects: { list: () => Promise.resolve(projects) },
            git,
            clock,
            runtime,
            worktreesDir,
        };
    });

    afterEach(() => {
        database.close();
        rmSync(worktreesDir, { recursive: true, force: true });
    });

    async function saveRunWithLogs(
        runId: string,
        run: { status: RunStatusName; finishedAt?: Date },
    ): Promise<void> {
        await runs.createRun(buildRunRecord({ id: runId, projectId: PROJECT.id, ...run }));
        await deps.logs.append({ runId, nodeRunId: `nrn_${runId}` }, textEvent(`log de ${runId}`));
    }

    async function bytesOfRun(runId: string): Promise<number> {
        const sizes = await deps.logs.listRunLogSizes();
        return sizes.find((size) => size.runId === runId)?.bytes ?? 0;
    }

    function createWorktreeDir(name: string): string {
        const worktreePath = path.join(worktreesDir, PROJECT.id, name);
        mkdirSync(worktreePath, { recursive: true });
        return worktreePath;
    }

    describe("logs", () => {
        it("expires the logs of runs finished more than 30 days ago", async () => {
            await saveRunWithLogs("run_velha", { status: "SUCCEEDED", finishedAt: daysAgo(31) });
            await saveRunWithLogs("run_recente", { status: "FAILED", finishedAt: daysAgo(2) });
            const freedBytes = await bytesOfRun("run_velha");

            const report = await runCleanup(deps);

            expect(report).toMatchObject({ deletedRuns: 1, freedBytes });
            const expiredRef = { runId: "run_velha", nodeRunId: "nrn_run_velha" };
            expect(await deps.logs.hasExpired(expiredRef)).toBe(true);
            expect(await bytesOfRun("run_recente")).toBeGreaterThan(0);
        });

        it("never removes the logs of an active run", async () => {
            await saveRunWithLogs("run_ativa", { status: "RUNNING" });
            globalSettings = { ...DEFAULT_GLOBAL_SETTINGS, logRetentionDays: 1 };
            clock.advance(10 * DAY_MS);

            const report = await runCleanup(deps);

            expect(report).toMatchObject({ deletedRuns: 0, freedBytes: 0 });
            expect(await bytesOfRun("run_ativa")).toBeGreaterThan(0);
        });

        it("removes the oldest finished runs while the logs exceed the ceiling", async () => {
            globalSettings = { ...DEFAULT_GLOBAL_SETTINGS, logMaxTotalMb: 1 };
            await saveRunWithLogs("run_antiga", { status: "SUCCEEDED", finishedAt: daysAgo(5) });
            await saveRunWithLogs("run_nova", { status: "SUCCEEDED", finishedAt: daysAgo(1) });
            const bigEvent = textEvent("x".repeat(BYTES_PER_MB));
            await deps.logs.append({ runId: "run_nova", nodeRunId: "nrn_grande" }, bigEvent);

            const report = await runCleanup(deps);

            expect(report.deletedRuns).toBe(2);
            expect(await deps.logs.listRunLogSizes()).toEqual([]);
        });
    });

    describe("worktrees", () => {
        it("prunes the worktrees of every project", async () => {
            await runCleanup(deps);

            expect(git.prunedRoots).toEqual([PROJECT.repoPath]);
        });

        it("removes the worktree directories git does not know about", async () => {
            const orphanPath = createWorktreeDir("forja__issue-3");

            const report = await runCleanup(deps);

            expect(report.prunedWorktrees).toBe(1);
            expect(existsSync(orphanPath)).toBe(false);
        });

        it("keeps the registered worktrees, such as those of active runs", async () => {
            const activePath = createWorktreeDir("forja__issue-7");
            git.registerWorktree(PROJECT.repoPath, activePath);

            const report = await runCleanup(deps);

            expect(report.prunedWorktrees).toBe(0);
            expect(existsSync(activePath)).toBe(true);
        });

        it("skips a project that never had a worktree", async () => {
            projects = [PROJECT, buildProject({ id: "prj_sem_worktrees" })];

            const report = await runCleanup(deps);

            expect(report.prunedWorktrees).toBe(0);
        });
    });

    describe("workspace containers", () => {
        it("closes the workspaces of runs that are no longer active", async () => {
            await runs.createRun(buildRunRecord({ id: "run_ativa", status: "RUNNING" }));
            await runs.createRun(buildRunRecord({ id: "run_cancelada", status: "CANCELED" }));
            runtime = new FakeAgentRuntime({
                clock,
                openWorkspaces: [
                    { id: "forja-ativa", runId: "run_ativa", workItemId: "itm_1" },
                    { id: "forja-cancelada", runId: "run_cancelada", workItemId: "itm_2" },
                ],
            });

            await runCleanup({ ...deps, runtime });

            const openIds = (await runtime.listOpenWorkspaces()).map((workspace) => workspace.id);
            expect(openIds).toEqual(["forja-ativa"]);
        });
    });
});
