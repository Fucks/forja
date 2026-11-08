import type { NodeRunError } from "@/engine/node_run_state.js";
import { createScheduler } from "@/engine/scheduler.js";
import type { Condition } from "@/shared/conditions.js";
import { buildLoopFlowWithExits } from "@/test/factories/flow_graph_factory.js";
import { moveNode } from "@/test/factories/flow_graph_variations.js";
import { buildRunState } from "@/test/factories/run_state_factory.js";
import {
    buildConditionFlow,
    buildLoopBesideAgentFlow,
    buildLinearAgentFlow,
    buildMappedLinearFlow,
    buildReportedCanonicalFlow,
    buildSingleAgentFlow,
    buildSourceFlow,
    withAgentConfig,
    withMapConfig,
    withoutRetries,
} from "@/test/factories/scheduler_flows.js";
import {
    createSchedulerHarness,
    DEFAULT_NODE_DURATION_MS,
    type NodeBehavior,
    type NodeOutcome,
    type NodeScript,
    type SchedulerHarness,
    type SchedulerHarnessOptions,
} from "@/test/factories/scheduler_harness.js";

const APPROVED: Condition = { op: "eq", path: "approved", value: true };
const RUNTIME_ERROR: NodeRunError = { kind: "runtime", message: "boom" };
const FAILED_FOR_GOOD: NodeOutcome = { kind: "fail", error: RUNTIME_ERROR };
const WORKSPACE_DOWN: NodeRunError = { kind: "workspace", message: "Docker parado" };
const INVALID_OUTPUT: NodeRunError = { kind: "structured_output", message: "saída inválida" };
const NEVER = Number.POSITIVE_INFINITY;
const FIVE_ITEMS = ["1", "2", "3", "4", "5"];
const DEV_DURATIONS_MS: Record<string, number> = {
    "1": 30_000,
    "2": 10_000,
    "3": 50_000,
    "4": 20_000,
    "5": 40_000,
};

describe("scheduler: DAG per item", () => {
    it("starts B for item 1 as soon as A for item 1 finishes, without waiting for item 2", () => {
        const harness = createSchedulerHarness({
            graph: buildLinearAgentFlow(),
            scripts: {
                a: ({ nodeRun }) => ({ durationMs: nodeRun.workItemId === "1" ? 1_000 : 9_000 }),
            },
        });

        harness.start(["1", "2"]);
        harness.runToCompletion();

        expect(harness.elapsedMsWhen("a", "1", "SUCCEEDED")).toBe(1_000);
        expect(harness.elapsedMsWhen("b", "1", "RUNNING")).toBe(1_000);
        expect(harness.elapsedMsWhen("a", "2", "SUCCEEDED")).toBe(9_000);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("feeds the outputs of A into the linked inputs of B for the same item", () => {
        const harness = createSchedulerHarness({ graph: buildLinearAgentFlow() });

        harness.start(["1", "2"]);
        harness.runToCompletion();

        const startsOfB = harness.startCommandsOf("b");
        expect(startsOfB.map((command) => command.inputs)).toEqual([
            { context: "a/1.summary" },
            { context: "a/2.summary" },
        ]);
    });

    it("succeeds the trigger right away with the items of the start event", () => {
        const harness = createSchedulerHarness({ graph: buildSingleAgentFlow() });

        harness.start(["1"]);

        expect(harness.entriesOf("trigger").map((entry) => entry.status)).toEqual([
            "PENDING",
            "SUCCEEDED",
        ]);
        expect(harness.startCommandsOf("trigger")).toEqual([]);
    });

    it("runs a node that receives the list once and fans its list out per item", () => {
        const harness = createSchedulerHarness({
            graph: buildSourceFlow(),
            scripts: {
                source: () => ({
                    outcome: { kind: "succeed", outputs: { items: [{ id: "7" }, { id: "8" }] } },
                }),
            },
        });

        harness.start([]);
        harness.runToCompletion();

        expect(harness.finalStatusOf("source")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("a", "7")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("a", "8")).toBe("SUCCEEDED");
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("succeeds a run started with no items", () => {
        const harness = createSchedulerHarness({ graph: buildLinearAgentFlow() });

        harness.start([]);

        expect(harness.run.status).toBe("SUCCEEDED");
    });
});

describe("scheduler: global concurrency", () => {
    it("never runs more than maxConcurrentAgents agents at once", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            maxConcurrentAgents: 2,
        });

        harness.start(["1", "2", "3", "4", "5"]);
        harness.runToCompletion();

        expect(harness.maxConcurrentRunningAgents()).toBe(2);
        expect(harness.agentStartsInOrder()).toHaveLength(5);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("spaces agent starts by at least minStartIntervalMs", () => {
        const minStartIntervalMs = 5_000;
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            minStartIntervalMs,
            scripts: { a: () => ({ durationMs: 60_000 }) },
        });

        harness.start(["1", "2", "3"]);
        harness.runToCompletion();

        const startTimesMs = harness.agentStartsInOrder().map((entry) => entry.elapsedMs);
        expect(startTimesMs).toEqual([0, 5_000, 10_000]);
    });

    it("asks the executor to wake it up when the next agent start is allowed", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            minStartIntervalMs: 5_000,
        });

        harness.start(["1", "2"]);

        expect(harness.commands).toContainEqual({
            type: "schedule_wakeup",
            at: new Date(harness.clock.now().getTime() + 5_000),
        });
    });

    it("starts non-agent nodes without waiting for a free agent slot", () => {
        const harness = createSchedulerHarness({
            graph: buildConditionFlow(APPROVED),
            maxConcurrentAgents: 1,
            scripts: {
                review: ({ nodeRun }) => ({
                    durationMs: nodeRun.workItemId === "1" ? 1_000 : 10_000,
                    outcome: { kind: "succeed", outputs: { result: { approved: false } } },
                }),
            },
        });

        harness.start(["1", "2"]);
        harness.runToCompletion();

        expect(harness.elapsedMsWhen("check", "1", "RUNNING")).toBe(1_000);
    });

    it("starts queued agents in FIFO order, breaking ties by DAG order and item id", () => {
        const harness = createSchedulerHarness({
            graph: buildLinearAgentFlow(),
            maxConcurrentAgents: 1,
        });

        harness.start(["2", "1"]);
        harness.runToCompletion();

        const startOrder = harness
            .agentStartsInOrder()
            .map((entry) => `${entry.nodeId}/${entry.workItemId ?? ""}`);
        expect(startOrder).toEqual(["a/1", "a/2", "b/1", "b/2"]);
    });
});

describe("scheduler: condition branches", () => {
    it("skips the nodes of the true branch for the item whose condition is false", () => {
        const harness = createSchedulerHarness({
            graph: buildConditionFlow(APPROVED),
            scripts: {
                review: ({ nodeRun }) => ({
                    outcome: {
                        kind: "succeed",
                        outputs: { result: { approved: nodeRun.workItemId === "1" } },
                    },
                }),
            },
        });

        harness.start(["1", "2"]);
        harness.runToCompletion();

        expect(harness.finalStatusOf("publish", "2")).toBe("SKIPPED");
        expect(harness.finalStatusOf("done", "2")).toBe("SKIPPED");
        expect(harness.finalStatusOf("rework", "2")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("publish", "1")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("done", "1")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("rework", "1")).toBe("SKIPPED");
        expect(harness.run.status).toBe("SUCCEEDED");
    });
});

describe("scheduler: failure", () => {
    it("fails the run only after the other running agents finish", () => {
        const harness = createSchedulerHarness({
            graph: withoutRetries(buildLinearAgentFlow()),
            scripts: {
                a: ({ nodeRun }) => {
                    if (nodeRun.workItemId === "1") {
                        return {
                            durationMs: 1_000,
                            outcome: { kind: "fail", error: RUNTIME_ERROR },
                        };
                    }
                    return { durationMs: 4_000 };
                },
            },
        });

        harness.start(["1", "2"]);
        harness.advance(DEFAULT_NODE_DURATION_MS);

        expect(harness.finalStatusOf("a", "1")).toBe("FAILED");
        expect(harness.finalStatusOf("b", "1")).toBe("CANCELED");
        expect(harness.run.status).toBe("RUNNING");

        harness.runToCompletion();

        expect(harness.finalStatusOf("a", "2")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("b", "2")).toBe("CANCELED");
        expect(harness.run.status).toBe("FAILED");
        expect(harness.elapsedMsWhenRunFinished()).toBe(4_000);
    });
});

describe("scheduler: retries", () => {
    it("retries an invalid structured output once with retries 1, 30 s after it failed", () => {
        const harness = createSchedulerHarness({
            graph: withAgentConfig(buildSingleAgentFlow(), "a", { retries: 1 }),
            scripts: { a: failingWith(INVALID_OUTPUT) },
        });

        harness.start(["1"]);
        harness.runToCompletion();

        const attempts = harness.attemptsOf("a", "1");
        expect(attempts.map(({ attempt, status }) => ({ attempt, status }))).toEqual([
            { attempt: 1, status: "FAILED" },
            { attempt: 2, status: "FAILED" },
        ]);
        expect(startTimesMsOf(harness, "a", "1")).toEqual([0, DEFAULT_NODE_DURATION_MS + 30_000]);
        expect(harness.run.status).toBe("FAILED");
    });

    it("queues the next attempt as soon as the previous one fails", () => {
        const harness = createSchedulerHarness({
            graph: withAgentConfig(buildSingleAgentFlow(), "a", { retries: 1 }),
            scripts: { a: failingWith(INVALID_OUTPUT) },
        });

        harness.start(["1"]);
        harness.advance(DEFAULT_NODE_DURATION_MS);

        expect(harness.attemptsOf("a", "1").at(-1)).toMatchObject({
            attempt: 2,
            status: "QUEUED",
        });
        expect(harness.run.status).toBe("RUNNING");
    });

    it("retries a workspace error twice, 2 min apart, even with retries 0", () => {
        const harness = createSchedulerHarness({
            graph: withAgentConfig(buildSingleAgentFlow(), "a", { retries: 0 }),
            scripts: { a: failingWith(WORKSPACE_DOWN) },
        });

        harness.start(["1"]);
        harness.runToCompletion();

        expect(harness.attemptsOf("a", "1").map((entry) => entry.attempt)).toEqual([1, 2, 3]);
        expect(startTimesMsOf(harness, "a", "1")).toEqual([0, 121_000, 242_000]);
        expect(harness.run.status).toBe("FAILED");
    });

    it("continues the flow with the attempt that succeeds", () => {
        const harness = createSchedulerHarness({
            graph: buildLinearAgentFlow(),
            scripts: { a: failingOnFirstAttemptWith(INVALID_OUTPUT) },
        });

        harness.start(["1"]);
        harness.runToCompletion();

        expect(harness.finalStatusOf("a", "1")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("b", "1")).toBe("SUCCEEDED");
        expect(harness.run.status).toBe("SUCCEEDED");
    });
});

describe("scheduler: total timeout", () => {
    const ONE_MINUTE_MS = 60_000;

    it("cancels an agent that exceeds timeoutMinutes and records it as timeout_total", () => {
        const harness = createSchedulerHarness({
            graph: withAgentConfig(buildSingleAgentFlow(), "a", { timeoutMinutes: 1, retries: 0 }),
            scripts: { a: () => ({ durationMs: 5 * ONE_MINUTE_MS }) },
        });

        harness.start(["1"]);
        harness.runToCompletion();

        expect(harness.commands).toContainEqual({
            type: "cancel_node_run",
            nodeRunId: harness.attemptsOf("a", "1")[0]?.nodeRunId,
        });
        expect(harness.elapsedMsWhen("a", "1", "FAILED")).toBe(ONE_MINUTE_MS);
        expect(errorKindsOf(harness, "a")).toEqual(["timeout_total"]);
        expect(harness.run.status).toBe("FAILED");
    });

    it("retries an agent that timed out like any other retryable failure", () => {
        const harness = createSchedulerHarness({
            graph: withAgentConfig(buildSingleAgentFlow(), "a", { timeoutMinutes: 1, retries: 1 }),
            scripts: {
                a: ({ nodeRun }) => ({
                    durationMs:
                        nodeRun.attempt === 1 ? 5 * ONE_MINUTE_MS : DEFAULT_NODE_DURATION_MS,
                }),
            },
        });

        harness.start(["1"]);
        harness.runToCompletion();

        expect(errorKindsOf(harness, "a")).toEqual(["timeout_total", undefined]);
        expect(harness.finalStatusOf("a", "1")).toBe("SUCCEEDED");
    });

    it("leaves alone an agent that finishes within its timeout", () => {
        const harness = createSchedulerHarness({
            graph: withAgentConfig(buildSingleAgentFlow(), "a", { timeoutMinutes: 1 }),
        });

        harness.start(["1"]);
        harness.runToCompletion();

        expect(harness.commands.filter((command) => command.type === "cancel_node_run")).toEqual(
            [],
        );
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("still records the timeout when restored from a snapshot before the cancel confirms", () => {
        const graph = withAgentConfig(buildSingleAgentFlow(), "a", { timeoutMinutes: 1 });
        const options = { maxConcurrentAgents: 1, minStartIntervalMs: 0, newId: sequentialIds() };
        const startedAt = new Date("2026-01-01T00:00:00Z");
        const scheduler = createScheduler(graph, buildRunState(), options);
        scheduler.handle({ type: "start", items: [{ id: "1" }], at: startedAt });
        const cancel = scheduler
            .tick(new Date(startedAt.getTime() + ONE_MINUTE_MS))
            .find((command) => command.type === "cancel_node_run");

        const restored = createScheduler(graph, buildRunState(), options, scheduler.snapshot());
        const commands = restored.handle({
            type: "node_run_failed",
            nodeRunId: cancel?.nodeRunId ?? "",
            error: { kind: "canceled", message: "Cancelado" },
            at: new Date(startedAt.getTime() + ONE_MINUTE_MS),
        });

        const changedNodeRun = commands.find((command) => command.type === "node_run_changed");
        expect(changedNodeRun?.nodeRun.error?.kind).toBe("timeout_total");
    });
});

describe("scheduler: cancel", () => {
    it("cancels the queue, asks the executor to cancel the running agents and ends CANCELED", () => {
        const harness = createSchedulerHarness({
            graph: buildLinearAgentFlow(),
            maxConcurrentAgents: 1,
        });
        harness.start(["1", "2"]);

        harness.requestCancel();

        expect(harness.finalStatusOf("a", "2")).toBe("CANCELED");
        expect(harness.finalStatusOf("b", "1")).toBe("CANCELED");
        expect(harness.commands).toContainEqual({
            type: "cancel_node_run",
            nodeRunId: harness.entriesOf("a", "1")[0]?.nodeRunId,
        });
        expect(harness.run.status).toBe("RUNNING");

        harness.advance(0);

        expect(harness.finalStatusOf("a", "1")).toBe("CANCELED");
        expect(harness.run.status).toBe("CANCELED");
    });

    it("cancels a run that has not started yet right away", () => {
        const harness = createSchedulerHarness({ graph: buildLinearAgentFlow() });

        harness.requestCancel();

        expect(harness.run.status).toBe("CANCELED");
    });
});

describe("scheduler: snapshot and restore", () => {
    it("produces a snapshot that survives a JSON round trip", () => {
        const harness = createSchedulerHarness({ graph: buildLinearAgentFlow() });
        harness.start(["1", "2"]);

        const snapshot = harness.snapshot();

        expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    });

    it("continues where it stopped when restored from a snapshot", () => {
        const harness = createSchedulerHarness({
            graph: buildLinearAgentFlow(),
            maxConcurrentAgents: 1,
            minStartIntervalMs: 5_000,
        });
        harness.start(["1", "2"]);
        harness.advance(DEFAULT_NODE_DURATION_MS);

        harness.restartFromSnapshot();
        harness.runToCompletion();

        const startOrder = harness
            .agentStartsInOrder()
            .map((entry) => `${entry.nodeId}/${entry.workItemId ?? ""}@${entry.elapsedMs}`);
        expect(startOrder).toEqual(["a/1@0", "a/2@5000", "b/1@10000", "b/2@15000"]);
        expect(harness.run.status).toBe("SUCCEEDED");
    });
});

describe("scheduler: map groups", () => {
    it("never runs more than concurrency items of a map and starts the rest as slots open", () => {
        const harness = createCanonicalHarness();

        harness.start([]);
        harness.runToCompletion();

        expect(harness.maxConcurrentRunningOf("dev")).toBe(3);
        expect(timesOf(harness, "dev", "RUNNING")).toEqual([2_000, 3_000, 4_000, 13_000, 32_000]);
        expect(timesOf(harness, "dev", "SUCCEEDED")).toEqual([
            32_000, 13_000, 54_000, 33_000, 72_000,
        ]);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("streams each item to the next map as soon as it finishes the previous one", () => {
        const harness = createCanonicalHarness();

        harness.start([]);
        harness.runToCompletion();

        expect(timesOf(harness, "tl", "RUNNING")).toEqual([1_000, 2_000, 3_000, 4_000, 5_000]);
        expect(timesOf(harness, "reviewer", "RUNNING")).toEqual([
            32_000, 13_000, 54_000, 34_000, 72_000,
        ]);
        expect(harness.maxConcurrentRunningOf("reviewer")).toBe(1);
    });

    it("gives each Dev the spec the TL wrote for the same item", () => {
        const harness = createCanonicalHarness();

        harness.start([]);
        harness.runToCompletion();

        const specsByItem = harness
            .startCommandsOf("dev")
            .map((command) => [command.nodeRun.workItemId, command.inputs.spec]);
        expect(Object.fromEntries(specsByItem)).toEqual({
            "1": "tl/1.summary",
            "2": "tl/2.summary",
            "3": "tl/3.summary",
            "4": "tl/4.summary",
            "5": "tl/5.summary",
        });
    });

    it("keeps the global agent ceiling inside the items of a map", () => {
        const harness = createCanonicalHarness({ maxConcurrentAgents: 2 });

        harness.start([]);
        harness.runToCompletion();

        expect(harness.maxConcurrentRunningAgents()).toBe(2);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("outputs the list of the map in input order, not in finishing order", () => {
        const harness = createCanonicalHarness();

        harness.start([]);
        harness.runToCompletion();

        expect(reviewsReceivedByReport(harness)).toEqual([
            "reviewer/1.summary",
            "reviewer/2.summary",
            "reviewer/3.summary",
            "reviewer/4.summary",
            "reviewer/5.summary",
        ]);
    });

    it("starts nothing downstream of a barrier map before all its items finish", () => {
        const harness = createCanonicalHarness({
            graph: withMapConfig(buildReportedCanonicalFlow(), "develop", { barrier: true }),
        });

        harness.start([]);
        harness.runToCompletion();

        expect(timesOf(harness, "reviewer", "RUNNING")).toEqual([
            72_000, 74_000, 76_000, 78_000, 80_000,
        ]);
    });

    it("holds the per-item nodes after a barrier map until the map is done", () => {
        const harness = createSchedulerHarness({
            graph: withMapConfig(buildMappedLinearFlow(), "map_a", {
                concurrency: 2,
                barrier: true,
            }),
            scripts: {
                a: ({ nodeRun }) => ({ durationMs: nodeRun.workItemId === "1" ? 1_000 : 9_000 }),
            },
        });

        harness.start(["1", "2"]);
        harness.runToCompletion();

        expect(harness.elapsedMsWhen("b", "1", "RUNNING")).toBe(9_000);
        expect(harness.elapsedMsWhen("b", "2", "RUNNING")).toBe(9_000);
    });

    it("keeps the other items going when one fails and does not pass it to the next map", () => {
        const harness = createCanonicalHarness({
            graph: withoutRetries(buildReportedCanonicalFlow()),
            scripts: { dev: developerFailingItem("2") },
        });

        harness.start([]);
        harness.runToCompletion();

        expect(harness.finalStatusOf("dev", "2")).toBe("FAILED");
        expect(harness.entriesOf("reviewer", "2")).toEqual([]);
        expect(harness.finalStatusOf("reviewer", "5")).toBe("SUCCEEDED");
        expect(reviewsReceivedByReport(harness)).toHaveLength(4);
        expect(harness.run.status).toBe("SUCCEEDED");
        expect(harness.run.failedItems).toEqual(["2"]);
    });

    it("cancels the queue and the running items of a failFast map when an item fails", () => {
        const harness = createCanonicalHarness({
            graph: withMapConfig(withoutRetries(buildReportedCanonicalFlow()), "develop", {
                failFast: true,
            }),
            scripts: { dev: developerFailingItem("2") },
        });

        harness.start([]);
        harness.runToCompletion();

        expect(harness.entriesOf("dev", "4")).toEqual([]);
        expect(harness.entriesOf("dev", "5")).toEqual([]);
        expect(harness.finalStatusOf("dev", "1")).toBe("CANCELED");
        expect(harness.finalStatusOf("dev", "3")).toBe("CANCELED");
        expect(harness.elapsedMsWhen("dev", "1", "CANCELED")).toBe(13_000);
        expect(harness.run.status).toBe("FAILED");
    });

    it("concludes the maps of an empty list and skips the node that waits for their output", () => {
        const harness = createCanonicalHarness({ scripts: { source: sourceReturning([]) } });

        harness.start([]);
        harness.runToCompletion();

        expect(harness.entriesOf("tl", "1")).toEqual([]);
        expect(harness.finalStatusOf("report")).toBe("SKIPPED");
        expect(harness.groupProgressOf("review_and_open_pr").at(-1)).toMatchObject({
            queued: 0,
            running: 0,
            succeeded: 0,
            failed: 0,
        });
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("reports the queue and the running items of a map on every change", () => {
        const harness = createCanonicalHarness();

        harness.start([]);
        harness.runToCompletion();

        const progress = harness.groupProgressOf("develop");
        expect(progress).toContainEqual({
            type: "group_progress",
            groupId: "develop",
            queued: 2,
            running: 3,
            succeeded: 0,
            failed: 0,
        });
        expect(progress.at(-1)).toMatchObject({ queued: 0, running: 0, succeeded: 5 });
    });

    it("continues the maps where they stopped when restored from a snapshot", () => {
        const harness = createCanonicalHarness();
        harness.start([]);
        harness.advance(20_000);

        harness.restartFromSnapshot();
        harness.runToCompletion();

        expect(harness.maxConcurrentRunningOf("dev")).toBe(3);
        expect(timesOf(harness, "dev", "RUNNING")).toEqual([2_000, 3_000, 4_000, 13_000, 32_000]);
        expect(reviewsReceivedByReport(harness)).toHaveLength(5);
        expect(harness.run.status).toBe("SUCCEEDED");
    });
});

describe("scheduler: loop groups", () => {
    it("ends the loop on the iteration the Reviewer approves and goes on to the PR", () => {
        const harness = createLoopHarness({ review: reviewerApprovingOnIteration(2) });

        harness.start([]);
        harness.runToCompletion();

        expect(iterationsOf(harness, "review", "1")).toEqual([1, 2]);
        expect(harness.finalStatusOf("open_pr", "1")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("needs_human", "1")).toBe("SKIPPED");
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("runs every node of the loop once per iteration, in the same item", () => {
        const harness = createLoopHarness({ review: reviewerApprovingOnIteration(2) });

        harness.start([]);
        harness.runToCompletion();

        expect(iterationsOf(harness, "dev", "1")).toEqual([1, 2]);
        expect(iterationsOf(harness, "tests", "1")).toEqual([1, 2]);
        expect(iterationsOf(harness, "open_pr", "1")).toEqual([0]);
    });

    it("hands the PR the outputs of the last iteration", () => {
        const harness = createLoopHarness({ review: reviewerApprovingOnIteration(2) });

        harness.start([]);
        harness.runToCompletion();

        expect(harness.startCommandsOf("open_pr")[0]?.inputs.body).toBe("revisão 2");
    });

    it("stops at maxIterations without approval and sends the item to needs_human", () => {
        const harness = createLoopHarness({ review: reviewerApprovingOnIteration(NEVER) });

        harness.start([]);
        harness.runToCompletion();

        expect(iterationsOf(harness, "review", "1")).toEqual([1, 2, 3]);
        expect(harness.finalStatusOf("open_pr", "1")).toBe("SKIPPED");
        expect(harness.startCommandsOf("needs_human")[0]?.inputs.item).toEqual({ id: "1" });
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("skips an exhausted exit that is outside the items of the loop instead of waiting", () => {
        const graph = moveNode(buildLoopFlowWithExits(), "needs_human", undefined);
        const harness = createSchedulerHarness({
            graph,
            scripts: {
                source: sourceReturning(["1"]),
                review: reviewerApprovingOnIteration(NEVER),
            },
        });

        harness.start([]);
        harness.runToCompletion();

        expect(harness.finalStatusOf("needs_human")).toBe("SKIPPED");
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("gives the Developer of iteration 2 the notes the Reviewer wrote in iteration 1", () => {
        const harness = createLoopHarness({ review: reviewerApprovingOnIteration(2) });

        harness.start([]);
        harness.runToCompletion();

        const notesByIteration = harness
            .startCommandsOf("dev")
            .map((command) => [command.nodeRun.iteration, command.inputs.notes]);
        expect(notesByIteration).toEqual([
            [1, undefined],
            [2, "notas da iteração 1"],
        ]);
    });

    it("keeps the iterations of each item of the enclosing map independent", () => {
        const harness = createLoopHarness({ review: reviewerApprovingByItem({ "1": 1, "2": 3 }) }, [
            "1",
            "2",
        ]);

        harness.start([]);
        harness.runToCompletion();

        expect(iterationsOf(harness, "review", "1")).toEqual([1]);
        expect(iterationsOf(harness, "review", "2")).toEqual([1, 2, 3]);
        expect(harness.finalStatusOf("open_pr", "1")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("open_pr", "2")).toBe("SUCCEEDED");
    });

    it("fails the item when a node inside the loop fails for good", () => {
        const harness = createLoopHarness(
            { review: reviewerApprovingOnIteration(NEVER), tests: testsFailingOn("1", 2) },
            ["1", "2"],
        );

        harness.start([]);
        harness.runToCompletion();

        expect(iterationsOf(harness, "tests", "1")).toEqual([1, 2]);
        expect(harness.finalStatusOf("review", "1")).toBe("SKIPPED");
        expect(harness.finalStatusOf("needs_human", "1")).toBe("SKIPPED");
        expect(harness.finalStatusOf("needs_human", "2")).toBe("SUCCEEDED");
        expect(harness.run.failedItems).toEqual(["1"]);
    });

    it("continues the loop where it stopped when restored from a snapshot", () => {
        const harness = createLoopHarness({ review: reviewerApprovingOnIteration(2) });

        harness.start([]);
        harness.advance(3_500);
        harness.restartFromSnapshot();
        harness.runToCompletion();

        expect(iterationsOf(harness, "review", "1")).toEqual([1, 2]);
        expect(harness.finalStatusOf("open_pr", "1")).toBe("SUCCEEDED");
    });

    it("starts no new iteration once the run is failing", () => {
        const harness = createSchedulerHarness({
            graph: withoutRetries(buildLoopBesideAgentFlow()),
            scripts: { c: () => ({ durationMs: 1_500, outcome: FAILED_FOR_GOOD }) },
        });

        harness.start(["1"]);
        harness.runToCompletion();

        expect(iterationsOf(harness, "b", "1")).toEqual([1]);
        expect(harness.finalStatusOf("b", "1")).toBe("SUCCEEDED");
        expect(harness.snapshot().loopInstances?.map((loop) => loop.status)).toEqual(["canceled"]);
        expect(harness.run.status).toBe("FAILED");
    });

    it("cancels the loop together with the run", () => {
        const harness = createLoopHarness({ review: reviewerApprovingOnIteration(NEVER) });

        harness.start([]);
        harness.advance(3_500);
        harness.requestCancel();
        harness.runToCompletion();

        expect(iterationsOf(harness, "review", "1")).toEqual([1]);
        expect(harness.snapshot().loopInstances?.map((loop) => loop.status)).toEqual(["canceled"]);
        expect(harness.run.status).toBe("CANCELED");
    });
});

function failingWith(error: NodeRunError): NodeScript {
    return () => ({ outcome: { kind: "fail", error } });
}

function failingOnFirstAttemptWith(error: NodeRunError): NodeScript {
    return ({ nodeRun }) => (nodeRun.attempt === 1 ? { outcome: { kind: "fail", error } } : {});
}

function sequentialIds(): () => string {
    let nextNumber = 1;

    return () => `nrn_${nextNumber++}`;
}

function errorKindsOf(harness: SchedulerHarness, nodeId: string): (string | undefined)[] {
    return harness
        .snapshot()
        .nodeRuns.filter((nodeRun) => nodeRun.nodeId === nodeId)
        .map((nodeRun) => nodeRun.error?.kind);
}

function startTimesMsOf(harness: SchedulerHarness, nodeId: string, itemId: string): number[] {
    return harness
        .entriesOf(nodeId, itemId)
        .filter((entry) => entry.status === "RUNNING")
        .map((entry) => entry.elapsedMs);
}

function createLoopHarness(
    scripts: Record<string, NodeScript>,
    itemIds: string[] = ["1"],
): SchedulerHarness {
    return createSchedulerHarness({
        graph: buildLoopFlowWithExits(),
        scripts: { source: sourceReturning(itemIds), ...scripts },
    });
}

function reviewerApprovingOnIteration(approvingIteration: number): NodeScript {
    return ({ nodeRun }) => reviewOutcome(nodeRun.iteration, approvingIteration);
}

function reviewerApprovingByItem(approvingIterationByItem: Record<string, number>): NodeScript {
    return ({ nodeRun }) =>
        reviewOutcome(
            nodeRun.iteration,
            approvingIterationByItem[nodeRun.workItemId ?? ""] ?? NEVER,
        );
}

function reviewOutcome(iteration: number, approvingIteration: number): Partial<NodeBehavior> {
    const outputs = {
        summary: `revisão ${iteration}`,
        approved: iteration >= approvingIteration,
        notes: `notas da iteração ${iteration}`,
    };

    return { outcome: { kind: "succeed", outputs } };
}

function testsFailingOn(failingItemId: string, failingIteration: number): NodeScript {
    return ({ nodeRun }) => {
        const isFailing =
            nodeRun.workItemId === failingItemId && nodeRun.iteration === failingIteration;

        return isFailing ? { outcome: FAILED_FOR_GOOD } : {};
    };
}

function iterationsOf(harness: SchedulerHarness, nodeId: string, itemId: string): number[] {
    return harness
        .startCommandsOf(nodeId)
        .filter((command) => command.nodeRun.workItemId === itemId)
        .map((command) => command.nodeRun.iteration);
}

function createCanonicalHarness(options: Partial<SchedulerHarnessOptions> = {}): SchedulerHarness {
    return createSchedulerHarness({
        graph: buildReportedCanonicalFlow(),
        ...options,
        scripts: {
            source: sourceReturning(FIVE_ITEMS),
            dev: developerWithScriptedDurations,
            ...options.scripts,
        },
    });
}

function sourceReturning(itemIds: string[]): NodeScript {
    const items = itemIds.map((id) => ({ id }));

    return () => ({ outcome: { kind: "succeed", outputs: { items } } });
}

const developerWithScriptedDurations: NodeScript = ({ nodeRun }) => ({
    durationMs: DEV_DURATIONS_MS[nodeRun.workItemId ?? ""] ?? DEFAULT_NODE_DURATION_MS,
});

function developerFailingItem(failingItemId: string): NodeScript {
    return (started) => {
        const behavior = developerWithScriptedDurations(started);
        if (started.nodeRun.workItemId !== failingItemId) {
            return behavior;
        }

        return { ...behavior, outcome: { kind: "fail", error: RUNTIME_ERROR } };
    };
}

function timesOf(harness: SchedulerHarness, nodeId: string, status: "RUNNING" | "SUCCEEDED") {
    return FIVE_ITEMS.map((itemId) => harness.elapsedMsWhen(nodeId, itemId, status));
}

function reviewsReceivedByReport(harness: SchedulerHarness): unknown {
    return harness.startCommandsOf("report")[0]?.inputs.reviews;
}
