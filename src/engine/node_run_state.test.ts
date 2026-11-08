import { InvalidTransitionError } from "@/engine/invalid_transition_error.js";
import {
    canTransitionNodeRun,
    createNextAttempt,
    NODE_RUN_TERMINAL,
    type NodeRunError,
    transitionNodeRun,
} from "@/engine/node_run_state.js";
import { NODE_RUN_STATUS_NAMES, type NodeRunStatusName } from "@/shared/events.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { excludeStatusPairs, listAllStatusPairs, type StatusPair } from "@/test/status_pairs.js";

const VALID_NODE_RUN_TRANSITIONS: StatusPair<NodeRunStatusName>[] = [
    ["PENDING", "QUEUED"],
    ["PENDING", "SKIPPED"],
    ["PENDING", "CANCELED"],
    ["QUEUED", "RUNNING"],
    ["QUEUED", "CANCELED"],
    ["QUEUED", "SKIPPED"],
    ["RUNNING", "SUCCEEDED"],
    ["RUNNING", "FAILED"],
    ["RUNNING", "CANCELED"],
    ["RUNNING", "WAITING_APPROVAL"],
    ["RUNNING", "WAITING_LIMIT"],
    ["RUNNING", "INTERRUPTED"],
    ["WAITING_APPROVAL", "SUCCEEDED"],
    ["WAITING_APPROVAL", "FAILED"],
    ["WAITING_APPROVAL", "CANCELED"],
    ["WAITING_LIMIT", "QUEUED"],
    ["WAITING_LIMIT", "CANCELED"],
    ["INTERRUPTED", "QUEUED"],
    ["INTERRUPTED", "CANCELED"],
];

const INVALID_NODE_RUN_TRANSITIONS = excludeStatusPairs(
    listAllStatusPairs(NODE_RUN_STATUS_NAMES),
    VALID_NODE_RUN_TRANSITIONS,
);

const TRANSITIONS_INTO_TERMINAL = VALID_NODE_RUN_TRANSITIONS.filter(([, to]) =>
    NODE_RUN_TERMINAL.has(to),
);

const TRANSITION_AT = new Date("2026-01-01T13:00:00Z");
const EARLIER = new Date("2026-01-01T12:30:00Z");

describe("canTransitionNodeRun", () => {
    it.each(VALID_NODE_RUN_TRANSITIONS)("allows %s → %s", (from, to) => {
        expect(canTransitionNodeRun(from, to)).toBe(true);
    });

    it.each(INVALID_NODE_RUN_TRANSITIONS)("rejects %s → %s", (from, to) => {
        expect(canTransitionNodeRun(from, to)).toBe(false);
    });
});

describe("NODE_RUN_TERMINAL", () => {
    it("contains exactly SUCCEEDED, FAILED, CANCELED and SKIPPED", () => {
        expect([...NODE_RUN_TERMINAL].sort()).toEqual([
            "CANCELED",
            "FAILED",
            "SKIPPED",
            "SUCCEEDED",
        ]);
    });

    it.each([...NODE_RUN_TERMINAL])("does not let %s move to any other status", (terminal) => {
        const reachable = NODE_RUN_STATUS_NAMES.filter((to) => canTransitionNodeRun(terminal, to));

        expect(reachable).toEqual([]);
    });
});

describe("transitionNodeRun", () => {
    it.each(VALID_NODE_RUN_TRANSITIONS)("moves the node run from %s to %s", (from, to) => {
        const nodeRun = buildNodeRunState({ status: from });

        const transitioned = transitionNodeRun(nodeRun, to, TRANSITION_AT);

        expect(transitioned.status).toBe(to);
    });

    it.each(INVALID_NODE_RUN_TRANSITIONS)(
        "throws InvalidTransitionError for %s → %s",
        (from, to) => {
            const nodeRun = buildNodeRunState({ status: from });

            const attemptTransition = () => transitionNodeRun(nodeRun, to, TRANSITION_AT);

            expect(attemptTransition).toThrow(InvalidTransitionError);
            expect(attemptTransition).toThrow(`${from} → ${to}`);
        },
    );

    it("does not change the given node run", () => {
        const nodeRun = buildNodeRunState({ status: "PENDING" });

        transitionNodeRun(nodeRun, "QUEUED", TRANSITION_AT);

        expect(nodeRun).toEqual(buildNodeRunState({ status: "PENDING" }));
    });

    it("sets queuedAt when the node run is queued", () => {
        const nodeRun = buildNodeRunState({ status: "PENDING" });

        const queued = transitionNodeRun(nodeRun, "QUEUED", TRANSITION_AT);

        expect(queued.queuedAt).toEqual(TRANSITION_AT);
        expect(queued.startedAt).toBeUndefined();
        expect(queued.finishedAt).toBeUndefined();
    });

    it("sets startedAt when the node run starts", () => {
        const nodeRun = buildNodeRunState({ status: "QUEUED", queuedAt: EARLIER });

        const started = transitionNodeRun(nodeRun, "RUNNING", TRANSITION_AT);

        expect(started.startedAt).toEqual(TRANSITION_AT);
        expect(started.queuedAt).toEqual(EARLIER);
        expect(started.finishedAt).toBeUndefined();
    });

    it.each<NodeRunStatusName>(["WAITING_LIMIT", "INTERRUPTED"])(
        "keeps the original queuedAt and startedAt when a %s node run is queued again",
        (from) => {
            const nodeRun = buildNodeRunState({
                status: from,
                queuedAt: EARLIER,
                startedAt: EARLIER,
            });

            const requeued = transitionNodeRun(nodeRun, "QUEUED", TRANSITION_AT);
            const restarted = transitionNodeRun(requeued, "RUNNING", TRANSITION_AT);

            expect(restarted).toMatchObject({ queuedAt: EARLIER, startedAt: EARLIER });
        },
    );

    it.each(TRANSITIONS_INTO_TERMINAL)("sets finishedAt on %s → %s", (from, terminal) => {
        const nodeRun = buildNodeRunState({ status: from });

        const finished = transitionNodeRun(nodeRun, terminal, TRANSITION_AT);

        expect(finished.finishedAt).toEqual(TRANSITION_AT);
    });

    it.each<NodeRunStatusName>(["WAITING_APPROVAL", "WAITING_LIMIT", "INTERRUPTED"])(
        "does not set finishedAt when the node run becomes %s",
        (to) => {
            const nodeRun = buildNodeRunState({ status: "RUNNING", startedAt: EARLIER });

            const waiting = transitionNodeRun(nodeRun, to, TRANSITION_AT);

            expect(waiting.finishedAt).toBeUndefined();
        },
    );

    it("applies the extra fields to the transitioned node run", () => {
        const nodeRun = buildNodeRunState({ status: "RUNNING", startedAt: EARLIER });
        const error: NodeRunError = { kind: "timeout_idle", message: "sem saída por 10 minutos" };

        const failed = transitionNodeRun(nodeRun, "FAILED", TRANSITION_AT, {
            error,
            outputs: { summary: "parcial" },
        });

        expect(failed).toMatchObject({ error, outputs: { summary: "parcial" } });
    });

    it("ignores a status given in extra", () => {
        const nodeRun = buildNodeRunState({ status: "PENDING" });

        const queued = transitionNodeRun(nodeRun, "QUEUED", TRANSITION_AT, { status: "RUNNING" });

        expect(queued.status).toBe("QUEUED");
    });
});

describe("createNextAttempt", () => {
    it("starts a new PENDING NodeRun of the same node, item and iteration", () => {
        const failed = buildNodeRunState({
            workItemId: "7",
            iteration: 2,
            attempt: 1,
            status: "FAILED",
            startedAt: EARLIER,
            finishedAt: TRANSITION_AT,
            error: { kind: "runtime", message: "boom" },
        });

        const nextAttempt = createNextAttempt(failed, "node-run-2");

        expect(nextAttempt).toEqual(
            buildNodeRunState({ id: "node-run-2", workItemId: "7", iteration: 2, attempt: 2 }),
        );
    });
});
