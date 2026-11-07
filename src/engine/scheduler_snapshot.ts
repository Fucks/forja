import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RunState } from "@/engine/run_state.js";
import type { JsonDates, SchedulerSnapshot, SchedulerState } from "@/engine/scheduler_types.js";

export function takeSnapshot(state: SchedulerState): SchedulerSnapshot {
    return {
        run: runToJson(state.run),
        nodeRuns: state.nodeRuns.map(nodeRunToJson),
        items: state.items,
        lastAgentStartAt: state.lastAgentStartAt?.toISOString(),
        stopOutcome: state.stopOutcome,
    };
}

export function restoreSnapshot(snapshot: SchedulerSnapshot): SchedulerState {
    return {
        run: runFromJson(snapshot.run),
        nodeRuns: snapshot.nodeRuns.map(nodeRunFromJson),
        items: snapshot.items,
        lastAgentStartAt: optionalDate(snapshot.lastAgentStartAt),
        stopOutcome: snapshot.stopOutcome,
    };
}

function runToJson(run: RunState): JsonDates<RunState> {
    return {
        ...run,
        resumeAt: run.resumeAt?.toISOString(),
        createdAt: run.createdAt.toISOString(),
        startedAt: run.startedAt?.toISOString(),
        finishedAt: run.finishedAt?.toISOString(),
    };
}

function runFromJson(run: JsonDates<RunState>): RunState {
    return {
        ...run,
        resumeAt: optionalDate(run.resumeAt),
        createdAt: new Date(run.createdAt),
        startedAt: optionalDate(run.startedAt),
        finishedAt: optionalDate(run.finishedAt),
    };
}

function nodeRunToJson(nodeRun: NodeRunState): JsonDates<NodeRunState> {
    return {
        ...nodeRun,
        queuedAt: nodeRun.queuedAt?.toISOString(),
        startedAt: nodeRun.startedAt?.toISOString(),
        finishedAt: nodeRun.finishedAt?.toISOString(),
    };
}

function nodeRunFromJson(nodeRun: JsonDates<NodeRunState>): NodeRunState {
    return {
        ...nodeRun,
        queuedAt: optionalDate(nodeRun.queuedAt),
        startedAt: optionalDate(nodeRun.startedAt),
        finishedAt: optionalDate(nodeRun.finishedAt),
    };
}

function optionalDate(isoDate: string | undefined): Date | undefined {
    return isoDate === undefined ? undefined : new Date(isoDate);
}
