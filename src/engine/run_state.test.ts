import { InvalidTransitionError } from "@/engine/invalid_transition_error.js";
import { canReopenRun, canTransitionRun, RUN_TERMINAL, transitionRun } from "@/engine/run_state.js";
import { RUN_STATUS_NAMES, type RunStatusName } from "@/shared/events.js";
import { buildRunState } from "@/test/factories/run_state_factory.js";
import { excludeStatusPairs, listAllStatusPairs, type StatusPair } from "@/test/status_pairs.js";

const VALID_RUN_TRANSITIONS: StatusPair<RunStatusName>[] = [
    ["QUEUED", "RUNNING"],
    ["QUEUED", "CANCELED"],
    ["RUNNING", "PAUSED"],
    ["RUNNING", "SUCCEEDED"],
    ["RUNNING", "FAILED"],
    ["RUNNING", "CANCELED"],
    ["PAUSED", "RUNNING"],
    ["PAUSED", "CANCELED"],
    ["FAILED", "RUNNING"],
    ["SUCCEEDED", "RUNNING"],
];

const INVALID_RUN_TRANSITIONS = excludeStatusPairs(
    listAllStatusPairs(RUN_STATUS_NAMES),
    VALID_RUN_TRANSITIONS,
);

const TRANSITION_AT = new Date("2026-01-01T13:00:00Z");
const EARLIER = new Date("2026-01-01T12:30:00Z");

describe("canTransitionRun", () => {
    it.each(VALID_RUN_TRANSITIONS)("allows %s → %s", (from, to) => {
        expect(canTransitionRun(from, to)).toBe(true);
    });

    it.each(INVALID_RUN_TRANSITIONS)("rejects %s → %s", (from, to) => {
        expect(canTransitionRun(from, to)).toBe(false);
    });
});

describe("RUN_TERMINAL", () => {
    it("contains exactly SUCCEEDED, FAILED and CANCELED", () => {
        expect([...RUN_TERMINAL].sort()).toEqual(["CANCELED", "FAILED", "SUCCEEDED"]);
    });

    it("does not let a canceled run move to any other status", () => {
        const reachable = RUN_STATUS_NAMES.filter((to) => canTransitionRun("CANCELED", to));

        expect(reachable).toEqual([]);
    });

    it.each<RunStatusName>(["FAILED", "SUCCEEDED"])(
        "only lets a %s run reopen to RUNNING",
        (terminal) => {
            const reachable = RUN_STATUS_NAMES.filter((to) => canTransitionRun(terminal, to));

            expect(reachable).toEqual(["RUNNING"]);
        },
    );
});

describe("canReopenRun", () => {
    it.each<[RunStatusName, boolean]>([
        ["SUCCEEDED", true],
        ["FAILED", true],
        ["CANCELED", false],
        ["RUNNING", false],
        ["PAUSED", false],
        ["QUEUED", false],
    ])("answers %s → %s", (status, isReopenable) => {
        expect(canReopenRun(status)).toBe(isReopenable);
    });
});

describe("transitionRun", () => {
    it.each(VALID_RUN_TRANSITIONS)("moves the run from %s to %s", (from, to) => {
        const run = buildRunState({ status: from });

        const transitioned = transitionRun(run, to, TRANSITION_AT);

        expect(transitioned.status).toBe(to);
    });

    it.each(INVALID_RUN_TRANSITIONS)("throws InvalidTransitionError for %s → %s", (from, to) => {
        const run = buildRunState({ status: from });

        const attemptTransition = () => transitionRun(run, to, TRANSITION_AT);

        expect(attemptTransition).toThrow(InvalidTransitionError);
        expect(attemptTransition).toThrow(`${from} → ${to}`);
    });

    it("does not change the given run", () => {
        const run = buildRunState({ status: "QUEUED" });

        transitionRun(run, "RUNNING", TRANSITION_AT);

        expect(run).toEqual(buildRunState({ status: "QUEUED" }));
    });

    it("sets startedAt when the run starts", () => {
        const run = buildRunState({ status: "QUEUED" });

        const started = transitionRun(run, "RUNNING", TRANSITION_AT);

        expect(started.startedAt).toEqual(TRANSITION_AT);
        expect(started.finishedAt).toBeUndefined();
    });

    it("keeps the original startedAt when a paused run resumes", () => {
        const run = buildRunState({ status: "PAUSED", startedAt: EARLIER, pauseReason: "user" });

        const resumed = transitionRun(run, "RUNNING", TRANSITION_AT);

        expect(resumed.startedAt).toEqual(EARLIER);
    });

    it.each([...RUN_TERMINAL])("sets finishedAt when the run becomes %s", (terminal) => {
        const run = buildRunState({ status: "RUNNING", startedAt: EARLIER });

        const finished = transitionRun(run, terminal, TRANSITION_AT);

        expect(finished.finishedAt).toEqual(TRANSITION_AT);
        expect(finished.startedAt).toEqual(EARLIER);
    });

    it.each<RunStatusName>(["FAILED", "SUCCEEDED"])(
        "clears finishedAt and error when a %s run reopens",
        (terminal) => {
            const run = buildRunState({
                status: terminal,
                startedAt: EARLIER,
                finishedAt: EARLIER,
                error: "nó falhou",
            });

            const reopened = transitionRun(run, "RUNNING", TRANSITION_AT);

            expect(reopened).not.toHaveProperty("finishedAt");
            expect(reopened).not.toHaveProperty("error");
            expect(reopened.startedAt).toEqual(EARLIER);
        },
    );

    it("does not set finishedAt when the run pauses", () => {
        const run = buildRunState({ status: "RUNNING", startedAt: EARLIER });

        const paused = transitionRun(run, "PAUSED", TRANSITION_AT);

        expect(paused.finishedAt).toBeUndefined();
    });

    it("applies the extra fields to the transitioned run", () => {
        const run = buildRunState({ status: "RUNNING", startedAt: EARLIER });

        const paused = transitionRun(run, "PAUSED", TRANSITION_AT, {
            pauseReason: "usage_limit",
            resumeAt: TRANSITION_AT,
        });

        expect(paused).toMatchObject({ pauseReason: "usage_limit", resumeAt: TRANSITION_AT });
    });

    it("records the error given in extra when the run fails", () => {
        const run = buildRunState({ status: "RUNNING", startedAt: EARLIER });

        const failed = transitionRun(run, "FAILED", TRANSITION_AT, { error: "nó falhou" });

        expect(failed.error).toBe("nó falhou");
    });

    it("ignores a status given in extra", () => {
        const run = buildRunState({ status: "QUEUED" });

        const started = transitionRun(run, "RUNNING", TRANSITION_AT, { status: "SUCCEEDED" });

        expect(started.status).toBe("RUNNING");
    });

    it.each<RunStatusName>(["RUNNING", "CANCELED"])(
        "clears the pause reason and resume time when a paused run becomes %s",
        (to) => {
            const run = buildRunState({
                status: "PAUSED",
                startedAt: EARLIER,
                pauseReason: "usage_limit",
                resumeAt: TRANSITION_AT,
            });

            const transitioned = transitionRun(run, to, TRANSITION_AT);

            expect(transitioned).not.toHaveProperty("pauseReason");
            expect(transitioned).not.toHaveProperty("resumeAt");
        },
    );
});
