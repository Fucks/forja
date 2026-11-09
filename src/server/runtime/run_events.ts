import type { NodeRunState } from "@/engine/node_run_state.js";
import { RUN_TERMINAL, type RunState } from "@/engine/run_state.js";
import type { SchedulerCommand } from "@/engine/scheduler_types.js";
import type { AppendedLogRange } from "@/server/runtime/log_announcer.js";
import type { ForjaEvent } from "@/shared/events.js";

type GroupProgressCommand = Extract<SchedulerCommand, { type: "group_progress" }>;

type RunLifecycleEventType = "run.created" | "run.started" | "run.finished";

// One event per change of status; a change that keeps the status (failed items) announces nothing.
export function runChangedEvent(previous: RunState, current: RunState): ForjaEvent | undefined {
    if (current.status === "PAUSED") {
        return hasPauseChanged(previous, current) ? runPausedEvent(current) : undefined;
    }
    if (previous.status === current.status) {
        return undefined;
    }
    if (RUN_TERMINAL.has(current.status)) {
        return runLifecycleEvent("run.finished", current);
    }
    if (previous.status === "PAUSED") {
        return { type: "run.resumed", runId: current.id, projectId: current.projectId };
    }

    return runLifecycleEvent("run.started", current);
}

export function runLifecycleEvent(type: RunLifecycleEventType, run: RunState): ForjaEvent {
    return {
        type,
        runId: run.id,
        projectId: run.projectId,
        flowId: run.flowId,
        status: run.status,
    };
}

export function nodeRunUpdatedEvent(run: RunState, nodeRun: NodeRunState): ForjaEvent {
    return {
        type: "node_run.updated",
        runId: run.id,
        projectId: run.projectId,
        nodeRunId: nodeRun.id,
        nodeId: nodeRun.nodeId,
        workItemId: nodeRun.workItemId,
        status: nodeRun.status,
        attempt: nodeRun.attempt,
        iteration: nodeRun.iteration,
    };
}

export function groupProgressEvent(run: RunState, progress: GroupProgressCommand): ForjaEvent {
    return {
        type: "group.progress",
        runId: run.id,
        projectId: run.projectId,
        groupId: progress.groupId,
        queued: progress.queued,
        running: progress.running,
        succeeded: progress.succeeded,
        failed: progress.failed,
    };
}

export function usageLimitReachedEvent(run: RunState, resetAt: Date | undefined): ForjaEvent {
    return {
        type: "usage.limit_reached",
        projectId: run.projectId,
        runId: run.id,
        resetAt: resetAt?.toISOString(),
    };
}

export function usageLimitResetEvent(run: RunState): ForjaEvent {
    return { type: "usage.limit_reset", projectId: run.projectId };
}

export function usageRecordedEvent(
    run: RunState,
    nodeRunId: string,
    usage: { inputTokens: number; outputTokens: number; costUsd: number },
): ForjaEvent {
    return {
        type: "usage.recorded",
        runId: run.id,
        projectId: run.projectId,
        nodeRunId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
    };
}

export function logAppendedEvent(
    run: RunState,
    nodeRunId: string,
    { fromSeq, toSeq }: AppendedLogRange,
): ForjaEvent {
    return {
        type: "log.appended",
        runId: run.id,
        projectId: run.projectId,
        nodeRunId,
        fromSeq,
        toSeq,
    };
}

// A user pause taken over a limit pause is announced too.
function hasPauseChanged(previous: RunState, current: RunState): boolean {
    return previous.status !== "PAUSED" || previous.pauseReason !== current.pauseReason;
}

function runPausedEvent(run: RunState): ForjaEvent {
    return {
        type: "run.paused",
        runId: run.id,
        projectId: run.projectId,
        reason: run.pauseReason ?? "user",
        resumeAt: run.resumeAt?.toISOString(),
    };
}
