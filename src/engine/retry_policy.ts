import type { NodeRunState } from "@/engine/node_run_state.js";
import { assertNever } from "@/lib/assert_never.js";

export type FailureKind = NonNullable<NodeRunState["error"]>["kind"];

export interface RetryDecision {
    retry: boolean;
    delayMs: number;
    countsAsAttempt: boolean;
}

const FIRST_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const WORKSPACE_RETRY_DELAY_MS = 2 * 60_000;
// A stopped Docker rarely comes back on its own, so the node's own retries do not apply.
const MAX_WORKSPACE_RETRIES = 2;

const GIVE_UP: RetryDecision = { retry: false, delayMs: 0, countsAsAttempt: true };
// Usage limits pause the run (#48) and interruptions resume it (#52): neither is a failed attempt.
const HANDLED_ELSEWHERE: RetryDecision = { retry: false, delayMs: 0, countsAsAttempt: false };

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
