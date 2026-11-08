import { decideRetry, type FailureKind } from "@/engine/retry_policy.js";

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
