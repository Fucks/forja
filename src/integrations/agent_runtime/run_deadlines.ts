import {
    AgentCanceledError,
    AgentTimeoutError,
    type AgentTimeoutKind,
} from "@/integrations/agent_runtime/agent_errors.js";
import type { Clock } from "@/lib/clock.js";

export interface RunDeadlinesInput {
    clock: Clock;
    userSignal: AbortSignal;
    timeoutMs: number;
    idleTimeoutMs: number;
}

/** Aborts `signal` when the user cancels, the total time runs out or no output arrives in time. */
export interface RunDeadlines {
    readonly signal: AbortSignal;
    restartIdleTimer(): void;
    /** The error to report for a failure that may have been caused by `signal`. */
    explainInterruption(error: unknown): unknown;
    clear(): void;
}

export function startRunDeadlines(input: RunDeadlinesInput): RunDeadlines {
    const { clock } = input;
    const timeoutController = new AbortController();
    let expiredTimeout: AgentTimeoutKind | undefined;

    function expire(kind: AgentTimeoutKind): void {
        expiredTimeout ??= kind;
        timeoutController.abort();
    }

    const startIdleTimer = () => clock.setTimeout(() => expire("idle"), input.idleTimeoutMs);
    const cancelTotalTimer = clock.setTimeout(() => expire("total"), input.timeoutMs);
    let cancelIdleTimer = startIdleTimer();

    return {
        signal: AbortSignal.any([input.userSignal, timeoutController.signal]),

        restartIdleTimer() {
            cancelIdleTimer();
            cancelIdleTimer = startIdleTimer();
        },

        explainInterruption(error) {
            if (expiredTimeout) {
                return new AgentTimeoutError(expiredTimeout);
            }
            if (input.userSignal.aborted) {
                return new AgentCanceledError();
            }

            return error;
        },

        clear() {
            cancelTotalTimer();
            cancelIdleTimer();
        },
    };
}
