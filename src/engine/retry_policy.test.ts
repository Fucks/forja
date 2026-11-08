import {
    canRetryOnRequest,
    decideRetry,
    type FailureKind,
    shouldRecalculateAfterRetry,
} from "@/engine/retry_policy.js";
import type { NodeRunStatusName, RunStatusName } from "@/shared/events.js";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

const RETRYABLE_KINDS: FailureKind[] = [
    "structured_output",
    "timeout_idle",
    "timeout_total",
    "runtime",
];

describe("decideRetry", () => {
    describe.each(RETRYABLE_KINDS)("for %s", (kind) => {
        it.each([
            [1, 30 * SECOND_MS],
            [2, 60 * SECOND_MS],
            [3, 120 * SECOND_MS],
            [4, 240 * SECOND_MS],
            [5, 480 * SECOND_MS],
        ])("retries attempt %i after %i ms while within maxRetries", (attempt, delayMs) => {
            const decision = decideRetry(kind, attempt, 5);

            expect(decision).toEqual({ retry: true, delayMs, countsAsAttempt: true });
        });

        it("caps the backoff at 10 minutes", () => {
            const decision = decideRetry(kind, 6, 10);

            expect(decision.delayMs).toBe(10 * MINUTE_MS);
        });

        it("stops retrying once the attempt goes past maxRetries", () => {
            const decision = decideRetry(kind, 2, 1);

            expect(decision.retry).toBe(false);
            expect(decision.countsAsAttempt).toBe(true);
        });

        it("never retries when maxRetries is 0", () => {
            expect(decideRetry(kind, 1, 0).retry).toBe(false);
        });
    });

    describe("for workspace", () => {
        it.each([1, 2])("retries attempt %i after 2 minutes even with maxRetries 0", (attempt) => {
            const decision = decideRetry("workspace", attempt, 0);

            expect(decision).toEqual({
                retry: true,
                delayMs: 2 * MINUTE_MS,
                countsAsAttempt: true,
            });
        });

        it("stops after 2 retries even with a higher maxRetries", () => {
            expect(decideRetry("workspace", 3, 5).retry).toBe(false);
        });
    });

    it.each<FailureKind>(["canceled", "budget"])("never retries %s", (kind) => {
        const decision = decideRetry(kind, 1, 5);

        expect(decision).toEqual({ retry: false, delayMs: 0, countsAsAttempt: true });
    });

    it.each<FailureKind>(["usage_limit", "interrupted"])(
        "leaves %s to its own handling without counting an attempt",
        (kind) => {
            const decision = decideRetry(kind, 1, 5);

            expect(decision).toEqual({ retry: false, delayMs: 0, countsAsAttempt: false });
        },
    );
});

describe("canRetryOnRequest", () => {
    it.each<NodeRunStatusName>(["FAILED", "CANCELED"])(
        "retries a %s NodeRun of a run that goes on",
        (nodeRunStatus) => {
            expect(canRetryOnRequest(nodeRunStatus, { status: "RUNNING", isStopping: false })).toBe(
                true,
            );
        },
    );

    it.each<NodeRunStatusName>(["SUCCEEDED", "SKIPPED", "RUNNING", "QUEUED"])(
        "does not retry a %s NodeRun of a run that goes on",
        (nodeRunStatus) => {
            expect(canRetryOnRequest(nodeRunStatus, { status: "RUNNING", isStopping: false })).toBe(
                false,
            );
        },
    );

    it("does not retry while the run is stopping", () => {
        expect(canRetryOnRequest("FAILED", { status: "RUNNING", isStopping: true })).toBe(false);
    });

    it.each<[RunStatusName, NodeRunStatusName]>([
        ["SUCCEEDED", "SUCCEEDED"],
        ["SUCCEEDED", "SKIPPED"],
        ["FAILED", "FAILED"],
        ["FAILED", "CANCELED"],
    ])("retries any finished NodeRun of a %s run, which reopens (%s)", (runStatus, status) => {
        expect(canRetryOnRequest(status, { status: runStatus, isStopping: false })).toBe(true);
    });

    it.each<RunStatusName>(["CANCELED", "PAUSED", "QUEUED"])(
        "does not retry in a %s run",
        (runStatus) => {
            expect(canRetryOnRequest("FAILED", { status: runStatus, isStopping: false })).toBe(
                false,
            );
        },
    );
});

describe("shouldRecalculateAfterRetry", () => {
    it.each<[NodeRunStatusName, boolean]>([
        ["SKIPPED", true],
        ["FAILED", true],
        ["CANCELED", true],
        ["SUCCEEDED", false],
        ["PENDING", false],
        ["RUNNING", false],
    ])("answers %s → %s for a NodeRun downstream of the retried one", (status, expected) => {
        expect(shouldRecalculateAfterRetry(status)).toBe(expected);
    });
});
