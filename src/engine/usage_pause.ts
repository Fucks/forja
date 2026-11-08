import { type NodeRunState, transitionNodeRun } from "@/engine/node_run_state.js";

const MINUTE_MS = 60_000;
const DEFAULT_FALLBACK_MINUTES = 30;

// A reset time already past means the limit message was stale or misread: waiting the fallback
// is safer than retrying right away into the same limit.
export function computeResumeAt(
    now: Date,
    resetAt: Date | undefined,
    marginMinutes: number,
    fallbackMinutes = DEFAULT_FALLBACK_MINUTES,
): Date {
    if (!resetAt || resetAt.getTime() <= now.getTime()) {
        return addMinutes(now, fallbackMinutes);
    }

    return addMinutes(resetAt, marginMinutes);
}

// Same NodeRun and attempt: the agent resumes on the same branch, where the commits made before the
// limit still are. The timeout counts again from the new start.
export function requeueAfterUsageLimit(waiting: NodeRunState, at: Date): NodeRunState {
    const requeued = transitionNodeRun(waiting, "QUEUED", at);
    delete requeued.startedAt;
    delete requeued.error;

    return requeued;
}

function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * MINUTE_MS);
}
