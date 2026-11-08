import { NODE_RUN_TERMINAL, type NodeRunState } from "@/engine/node_run_state.js";
import { canReopenRun } from "@/engine/run_state.js";
import { assertNever } from "@/lib/assert_never.js";
import type { NodeRunStatusName, RunStatusName } from "@/shared/events.js";

export type FailureKind = NonNullable<NodeRunState["error"]>["kind"];

export interface RetryDecision {
    retry: boolean;
    delayMs: number;
    countsAsAttempt: boolean;
}

export interface RunRetryContext {
    status: RunStatusName;
    isStopping: boolean;
}

const MINUTE_MS = 60_000;
const FIRST_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 10 * MINUTE_MS;
const WORKSPACE_RETRY_DELAY_MS = 2 * MINUTE_MS;
// A stopped Docker rarely comes back on its own, so the node's own retries do not apply.
const MAX_WORKSPACE_RETRIES = 2;

const GIVE_UP: RetryDecision = { retry: false, delayMs: 0, countsAsAttempt: true };
// Usage limits pause the run (#48) and interruptions resume it (#52): neither is a failed attempt.
const HANDLED_ELSEWHERE: RetryDecision = { retry: false, delayMs: 0, countsAsAttempt: false };

const RETRYABLE_WHILE_RUN_GOES_ON: ReadonlySet<NodeRunStatusName> = new Set<NodeRunStatusName>([
    "FAILED",
    "CANCELED",
]);
// CANCELED too: a failed run cancels the NodeRuns that had not started yet.
const RECALCULATED_AFTER_RETRY: ReadonlySet<NodeRunStatusName> = new Set<NodeRunStatusName>([
    "SKIPPED",
    "FAILED",
    "CANCELED",
]);

// The attempt is the one that just failed, starting at 1.
export function decideRetry(kind: FailureKind, attempt: number, maxRetries: number): RetryDecision {
    switch (kind) {
        case "structured_output":
        case "timeout_idle":
        case "timeout_total":
        case "runtime":
            return retryWithBackoff(attempt, maxRetries);
        case "workspace":
            return retryWorkspace(attempt);
        case "canceled":
        case "budget":
            return GIVE_UP;
        case "usage_limit":
        case "interrupted":
            return HANDLED_ELSEWHERE;
        default:
            return assertNever(kind);
    }
}

// A finished run reopens for any of its finished NodeRuns, even a succeeded one.
export function canRetryOnRequest(nodeRunStatus: NodeRunStatusName, run: RunRetryContext): boolean {
    if (canReopenRun(run.status)) {
        return NODE_RUN_TERMINAL.has(nodeRunStatus);
    }

    const isRunGoingOn = run.status === "RUNNING" && !run.isStopping;

    return isRunGoingOn && RETRYABLE_WHILE_RUN_GOES_ON.has(nodeRunStatus);
}

// For the NodeRuns of the same item downstream of the retried one: those that did not succeed
// because of it run again.
export function shouldRecalculateAfterRetry(downstreamStatus: NodeRunStatusName): boolean {
    return RECALCULATED_AFTER_RETRY.has(downstreamStatus);
}

function retryWithBackoff(attempt: number, maxRetries: number): RetryDecision {
    if (attempt > maxRetries) {
        return GIVE_UP;
    }

    const backoffMs = FIRST_BACKOFF_MS * 2 ** (attempt - 1);

    return { retry: true, delayMs: Math.min(backoffMs, MAX_BACKOFF_MS), countsAsAttempt: true };
}

function retryWorkspace(attempt: number): RetryDecision {
    if (attempt > MAX_WORKSPACE_RETRIES) {
        return GIVE_UP;
    }

    return { retry: true, delayMs: WORKSPACE_RETRY_DELAY_MS, countsAsAttempt: true };
}
