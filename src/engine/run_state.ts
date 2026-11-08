import { InvalidTransitionError } from "@/engine/invalid_transition_error.js";
import type { RunStatusName } from "@/shared/events.js";

export const RUN_PAUSE_REASONS = ["user", "usage_limit", "budget"] as const;

export type RunPauseReason = (typeof RUN_PAUSE_REASONS)[number];

export interface RunState {
    id: string;
    projectId: string;
    flowId: string;
    flowVersion: number;
    status: RunStatusName;
    pauseReason?: RunPauseReason;
    resumeAt?: Date;
    createdAt: Date;
    startedAt?: Date;
    finishedAt?: Date;
    error?: string;
    // Items that failed inside a map; the run can still succeed without them.
    failedItems?: string[];
}

export const RUN_TERMINAL: ReadonlySet<RunStatusName> = new Set<RunStatusName>([
    "SUCCEEDED",
    "FAILED",
    "CANCELED",
]);

const RUN_TRANSITIONS: Record<RunStatusName, readonly RunStatusName[]> = {
    QUEUED: ["RUNNING", "CANCELED"],
    RUNNING: ["PAUSED", "SUCCEEDED", "FAILED", "CANCELED"],
    PAUSED: ["RUNNING", "CANCELED"],
    // A finished run reopens when the user retries one of its NodeRuns.
    SUCCEEDED: ["RUNNING"],
    FAILED: ["RUNNING"],
    CANCELED: [],
};

export function canTransitionRun(from: RunStatusName, to: RunStatusName): boolean {
    return RUN_TRANSITIONS[from].includes(to);
}

export function canReopenRun(status: RunStatusName): boolean {
    return RUN_TERMINAL.has(status) && canTransitionRun(status, "RUNNING");
}

export function transitionRun(
    run: RunState,
    to: RunStatusName,
    at: Date,
    extra: Partial<RunState> = {},
): RunState {
    if (!canTransitionRun(run.status, to)) {
        throw new InvalidTransitionError("Run", run.status, to);
    }

    return {
        ...clearOutcomeWhenReopening(clearPauseWhenLeavingPaused(run)),
        ...timestampsOnEntering(run, to, at),
        ...extra,
        status: to,
    };
}

function clearPauseWhenLeavingPaused(run: RunState): RunState {
    if (run.status !== "PAUSED") {
        return run;
    }

    const unpausedRun = { ...run };
    delete unpausedRun.pauseReason;
    delete unpausedRun.resumeAt;

    return unpausedRun;
}

function clearOutcomeWhenReopening(run: RunState): RunState {
    if (!RUN_TERMINAL.has(run.status)) {
        return run;
    }

    const reopenedRun = { ...run };
    delete reopenedRun.finishedAt;
    delete reopenedRun.error;

    return reopenedRun;
}

function timestampsOnEntering(
    run: RunState,
    to: RunStatusName,
    at: Date,
): Pick<RunState, "startedAt" | "finishedAt"> {
    if (to === "RUNNING") {
        return { startedAt: run.startedAt ?? at };
    }
    if (RUN_TERMINAL.has(to)) {
        return { finishedAt: at };
    }

    return {};
}
