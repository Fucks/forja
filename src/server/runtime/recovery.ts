import type { RunState } from "@/engine/run_state.js";
import type { SchedulerSnapshot } from "@/engine/scheduler_types.js";
import type { AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { Clock } from "@/lib/clock.js";
import type { RunRecord, RunRepository } from "@/server/runs/run_repository.js";
import type { Executor } from "@/server/runtime/executor.js";
import { isSchedulerSnapshotOfRun } from "@/server/runtime/stored_snapshot.js";

export interface RecoveryReport {
    resumed: string[];
    stillPaused: string[];
    interruptedNodeRuns: string[];
    closedWorkspaces: string[];
    failed: { runId: string; reason: string }[];
}

export interface RecoveryDeps {
    runs: RunRepository;
    executor: Executor;
    runtime: AgentRuntime;
    clock: Clock;
    log(message: string): void;
}

type RunRecovery =
    | { outcome: "resumed" | "still_paused"; runId: string; interruptedNodeRunIds: string[] }
    | { outcome: "failed"; runId: string; reason: string };

const RUN_STATE_LOST = "estado perdido no reinício";
const RESUME_FAILED = "não foi possível retomar a run após o reinício";

export async function recoverRuns(deps: RecoveryDeps): Promise<RecoveryReport> {
    const closedWorkspaces = await closeWorkspacesLeftOpen(deps.runtime);
    const activeRuns = await deps.runs.listActiveRuns();
    const recoveries = await Promise.all(activeRuns.map((run) => recoverRun(run, deps)));

    const report = buildReport(recoveries, closedWorkspaces);
    deps.log(describeRecovery(report));

    return report;
}

// Also those of the runs being resumed: the executor reopens them on demand, which is simpler
// and safer than reusing a container another process set up. The branch keeps the commits.
// Closed before any run resumes, so no workspace of the new process is closed by mistake.
async function closeWorkspacesLeftOpen(runtime: AgentRuntime): Promise<string[]> {
    const leftOpenIds = (await runtime.listOpenWorkspaces()).map((workspace) => workspace.id);
    await Promise.all(leftOpenIds.map((workspaceId) => runtime.closeWorkspace(workspaceId)));

    return leftOpenIds;
}

async function recoverRun(run: RunRecord, deps: RecoveryDeps): Promise<RunRecovery> {
    const snapshot = await deps.runs.getSnapshot(run.id);
    if (!isSchedulerSnapshotOfRun(snapshot, run.id)) {
        await saveFailedRun(run, RUN_STATE_LOST, deps);
        return { outcome: "failed", runId: run.id, reason: RUN_STATE_LOST };
    }

    try {
        await deps.executor.resumeFromSnapshot(run, snapshot);
    } catch (error) {
        // Left as it was, the run would stay active forever with nothing driving it.
        await saveFailedRun(run, RESUME_FAILED, deps);
        return { outcome: "failed", runId: run.id, reason: describeError(error) };
    }

    return {
        outcome: (await isPaused(run.id, deps.runs)) ? "still_paused" : "resumed",
        runId: run.id,
        interruptedNodeRunIds: runningNodeRunIdsOf(snapshot),
    };
}

async function saveFailedRun(run: RunRecord, error: string, deps: RecoveryDeps): Promise<void> {
    await deps.runs.saveTransition({ run: failedRunState(run, error, deps.clock.now()) });
}

// Written directly: the state machine only fails a running run, and a run whose state is lost
// may also be queued or paused.
function failedRunState(run: RunRecord, error: string, at: Date): RunState {
    const failed: RunState = { ...run, status: "FAILED", finishedAt: at, error };
    delete failed.pauseReason;
    delete failed.resumeAt;

    return failed;
}

async function isPaused(runId: string, runs: RunRepository): Promise<boolean> {
    const run = await runs.getRun(runId);
    return run?.status === "PAUSED";
}

function runningNodeRunIdsOf(snapshot: SchedulerSnapshot): string[] {
    return snapshot.nodeRuns
        .filter((nodeRun) => nodeRun.status === "RUNNING")
        .map((nodeRun) => nodeRun.id);
}

function buildReport(recoveries: RunRecovery[], closedWorkspaces: string[]): RecoveryReport {
    const report: RecoveryReport = {
        resumed: [],
        stillPaused: [],
        interruptedNodeRuns: [],
        closedWorkspaces,
        failed: [],
    };
    for (const recovery of recoveries) {
        addToReport(report, recovery);
    }

    return report;
}

function addToReport(report: RecoveryReport, recovery: RunRecovery): void {
    if (recovery.outcome === "failed") {
        report.failed.push({ runId: recovery.runId, reason: recovery.reason });
        return;
    }

    const runIds = recovery.outcome === "resumed" ? report.resumed : report.stillPaused;
    runIds.push(recovery.runId);
    report.interruptedNodeRuns.push(...recovery.interruptedNodeRunIds);
}

function describeRecovery(report: RecoveryReport): string {
    const counts = [
        countOf(report.resumed.length, "run retomada", "runs retomadas"),
        countOf(report.stillPaused.length, "run pausada", "runs pausadas"),
        countOf(report.failed.length, "run falhou", "runs falharam"),
        countOf(
            report.interruptedNodeRuns.length,
            "NodeRun interrompido",
            "NodeRuns interrompidos",
        ),
        countOf(report.closedWorkspaces.length, "workspace fechado", "workspaces fechados"),
    ];

    return `[forja] recuperação: ${counts.join(", ")}`;
}

function countOf(count: number, singular: string, plural: string): string {
    return `${count} ${count === 1 ? singular : plural}`;
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
