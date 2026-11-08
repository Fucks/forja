import { computeResumeAt, requeueAfterUsageLimit } from "@/engine/usage_pause.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";

const NOW = new Date("2026-01-01T14:00:00Z");
const MARGIN_MINUTES = 5;

describe("computeResumeAt", () => {
    it("resumes the margin after a reset time still ahead", () => {
        const resetAt = new Date("2026-01-01T15:00:00Z");

        const resumeAt = computeResumeAt(NOW, resetAt, MARGIN_MINUTES);

        expect(resumeAt).toEqual(new Date("2026-01-01T15:05:00Z"));
    });

    it("resumes 30 minutes from now when the limit does not say when it resets", () => {
        const resumeAt = computeResumeAt(NOW, undefined, MARGIN_MINUTES);

        expect(resumeAt).toEqual(new Date("2026-01-01T14:30:00Z"));
    });

    it("resumes 30 minutes from now when the reset time is already past", () => {
        const resetAt = new Date("2026-01-01T13:00:00Z");

        const resumeAt = computeResumeAt(NOW, resetAt, MARGIN_MINUTES);

        expect(resumeAt).toEqual(new Date("2026-01-01T14:30:00Z"));
    });

    it("treats a reset time equal to now as already past", () => {
        const resumeAt = computeResumeAt(NOW, NOW, MARGIN_MINUTES);

        expect(resumeAt).toEqual(new Date("2026-01-01T14:30:00Z"));
    });

    it("uses the given fallback when there is no reset time", () => {
        const resumeAt = computeResumeAt(NOW, undefined, MARGIN_MINUTES, 10);

        expect(resumeAt).toEqual(new Date("2026-01-01T14:10:00Z"));
    });
});

describe("requeueAfterUsageLimit", () => {
    const waiting = buildNodeRunState({
        id: "nrn_7",
        attempt: 2,
        status: "WAITING_LIMIT",
        queuedAt: new Date("2026-01-01T12:00:00Z"),
        startedAt: new Date("2026-01-01T12:30:00Z"),
        error: { kind: "usage_limit", message: "Limite de uso atingido" },
    });

    it("queues the same NodeRun again with the same attempt", () => {
        const requeued = requeueAfterUsageLimit(waiting, NOW);

        expect(requeued).toMatchObject({ id: "nrn_7", attempt: 2, status: "QUEUED" });
    });

    it("forgets the previous start and the limit error so the timeout counts from the restart", () => {
        const requeued = requeueAfterUsageLimit(waiting, NOW);

        expect(requeued).not.toHaveProperty("startedAt");
        expect(requeued).not.toHaveProperty("error");
    });

    it("keeps its place in the queue", () => {
        const requeued = requeueAfterUsageLimit(waiting, NOW);

        expect(requeued.queuedAt).toEqual(waiting.queuedAt);
    });
});
