import type { RunBudget } from "@/engine/budgets.js";
import type { NodeRunError } from "@/engine/node_run_state.js";
import { createScheduler } from "@/engine/scheduler.js";
import type {
    SchedulerCommand,
    SchedulerOptions,
    SchedulerSnapshot,
} from "@/engine/scheduler_types.js";
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
    DEFAULT_USAGE_LIMIT_MARGIN_MINUTES,
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
const MINUTE_MS = 60_000;
const DEV_WORK_MINUTES_BY_ITEM: Record<string, number> = { "1": 10, "2": 1, "3": 20 };
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
            scripts: { a: failingOnFirstAttemptOf("1", INVALID_OUTPUT) },
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
        const options = singleAgentSchedulerOptions();
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

    it("fails only the item whose NodeRun is canceled inside a map", () => {
        const harness = createCanonicalHarness();
        harness.start([]);
        harness.advance(5_000);

        harness.requestNodeRunCancel(latestNodeRunIdOf(harness, "dev", "2"));
        harness.runToCompletion();

        expect(harness.finalStatusOf("dev", "2")).toBe("CANCELED");
        expect(harness.entriesOf("reviewer", "2")).toEqual([]);
        expect(harness.finalStatusOf("reviewer", "5")).toBe("SUCCEEDED");
        expect(harness.run.failedItems).toEqual(["2"]);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("never retries a NodeRun the user canceled", () => {
        const harness = createCanonicalHarness();
        harness.start([]);
        harness.advance(5_000);

        harness.requestNodeRunCancel(latestNodeRunIdOf(harness, "dev", "2"));
        harness.runToCompletion();

        expect(harness.attemptsOf("dev", "2")).toHaveLength(1);
    });

    it("cancels a queued NodeRun without asking the executor", () => {
        const harness = createSchedulerHarness({
            graph: withMapConfig(buildMappedLinearFlow(), "map_a", { concurrency: 2 }),
            maxConcurrentAgents: 1,
        });
        harness.start(["1", "2"]);
        const queuedNodeRunId = latestNodeRunIdOf(harness, "a", "2");

        harness.requestNodeRunCancel(queuedNodeRunId);

        expect(harness.finalStatusOf("a", "2")).toBe("CANCELED");
        expect(harness.commands).not.toContainEqual({
            type: "cancel_node_run",
            nodeRunId: queuedNodeRunId,
        });
        harness.runToCompletion();
        expect(harness.finalStatusOf("b", "1")).toBe("SUCCEEDED");
        expect(harness.run.failedItems).toEqual(["2"]);
    });

    it("cancels the whole run when the canceled NodeRun is outside groups", () => {
        const harness = createSchedulerHarness({ graph: buildLinearAgentFlow() });
        harness.start(["1", "2"]);

        harness.requestNodeRunCancel(latestNodeRunIdOf(harness, "a", "1"));
        harness.runToCompletion();

        expect(harness.finalStatusOf("a", "2")).toBe("CANCELED");
        expect(harness.run.status).toBe("CANCELED");
    });

    it("cancels a run that has not started yet right away", () => {
        const harness = createSchedulerHarness({ graph: buildLinearAgentFlow() });

        harness.requestCancel();

        expect(harness.run.status).toBe("CANCELED");
    });
});

describe("scheduler: retry requested by the user", () => {
    it("reopens a finished run and reruns only the retried Reviewer of that item", () => {
        const harness = createCanonicalHarness();
        harness.start([]);
        harness.runToCompletion();
        const startCountBeforeRetry = harness.agentStartsInOrder().length;

        harness.requestNodeRunRetry(latestNodeRunIdOf(harness, "reviewer", "1"));
        harness.runToCompletion();

        const startsAfterRetry = harness.agentStartsInOrder().slice(startCountBeforeRetry);
        expect(startsAfterRetry.map(({ nodeId, workItemId }) => ({ nodeId, workItemId }))).toEqual([
            { nodeId: "reviewer", workItemId: "1" },
        ]);
        expect(harness.attemptsOf("reviewer", "1").map((entry) => entry.attempt)).toEqual([1, 2]);
        expect(runStatusesOf(harness).slice(-2)).toEqual(["RUNNING", "SUCCEEDED"]);
    });

    it("recalculates the nodes of the item that the failed Reviewer had skipped", () => {
        const harness = createCanonicalHarness({
            graph: withoutRetries(buildReportedCanonicalFlow()),
            scripts: { reviewer: failingOnFirstAttemptOf("2", RUNTIME_ERROR) },
        });
        harness.start([]);
        harness.runToCompletion();
        expect(harness.finalStatusOf("open_pr", "2")).toBe("SKIPPED");
        expect(harness.run.failedItems).toEqual(["2"]);

        harness.requestNodeRunRetry(latestNodeRunIdOf(harness, "reviewer", "2"));
        harness.runToCompletion();

        expect(harness.finalStatusOf("reviewer", "2")).toBe("SUCCEEDED");
        expect(harness.attemptsOf("open_pr", "2").map((entry) => entry.status)).toEqual([
            "SKIPPED",
            "SUCCEEDED",
        ]);
        expect(harness.attemptsOf("open_pr", "1")).toHaveLength(1);
        expect(harness.run.failedItems).toEqual([]);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("reopens a failed run and runs the NodeRuns its failure had canceled", () => {
        const harness = createSchedulerHarness({
            graph: withoutRetries(buildLinearAgentFlow()),
            scripts: { a: failingOnFirstAttemptOf("1", RUNTIME_ERROR) },
        });
        harness.start(["1"]);
        harness.runToCompletion();
        expect(harness.run.status).toBe("FAILED");
        const retriedAtMs = harness.clock.now().getTime();

        harness.requestNodeRunRetry(latestNodeRunIdOf(harness, "a", "1"));
        harness.runToCompletion();

        expect(harness.finalStatusOf("b", "1")).toBe("SUCCEEDED");
        expect(harness.run.status).toBe("SUCCEEDED");
        expect(harness.run.finishedAt?.getTime()).toBe(retriedAtMs + 2 * DEFAULT_NODE_DURATION_MS);
    });

    it("continues a failed item into the next map once the retried Developer succeeds", () => {
        const harness = createCanonicalHarness({
            graph: withoutRetries(buildReportedCanonicalFlow()),
            scripts: { dev: failingOnFirstAttemptOf("2", RUNTIME_ERROR) },
        });
        harness.start([]);
        harness.runToCompletion();

        harness.requestNodeRunRetry(latestNodeRunIdOf(harness, "dev", "2"));
        harness.runToCompletion();

        expect(harness.finalStatusOf("reviewer", "2")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("open_pr", "2")).toBe("SUCCEEDED");
        expect(harness.run.status).toBe("SUCCEEDED");
    });
});

describe("scheduler: retry requested while the run goes on", () => {
    it("reruns a canceled NodeRun of a map item and lets the item go on", () => {
        const harness = createCanonicalHarness();
        harness.start([]);
        harness.advance(5_000);
        harness.requestNodeRunCancel(latestNodeRunIdOf(harness, "dev", "2"));
        harness.advance(1_000);

        harness.requestNodeRunRetry(latestNodeRunIdOf(harness, "dev", "2"));
        harness.runToCompletion();

        expect(harness.attemptsOf("dev", "2").map((entry) => entry.status)).toEqual([
            "CANCELED",
            "SUCCEEDED",
        ]);
        expect(harness.finalStatusOf("reviewer", "2")).toBe("SUCCEEDED");
        expect(harness.run.failedItems).toEqual([]);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("ignores a retry of a NodeRun that is still running", () => {
        const harness = createSchedulerHarness({ graph: buildSingleAgentFlow() });
        harness.start(["1"]);

        harness.requestNodeRunRetry(latestNodeRunIdOf(harness, "a", "1"));
        harness.runToCompletion();

        expect(harness.attemptsOf("a", "1")).toHaveLength(1);
    });

    it("ignores a retry of an attempt that was already retried", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            scripts: { a: failingOnFirstAttemptOf("1", INVALID_OUTPUT) },
        });
        harness.start(["1"]);
        harness.runToCompletion();

        harness.requestNodeRunRetry(harness.attemptsOf("a", "1")[0]?.nodeRunId ?? "");

        expect(harness.attemptsOf("a", "1")).toHaveLength(2);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("does not reopen a canceled run", () => {
        const harness = createSchedulerHarness({ graph: buildSingleAgentFlow() });
        harness.start(["1"]);
        harness.requestCancel();
        harness.runToCompletion();

        harness.requestNodeRunRetry(latestNodeRunIdOf(harness, "a", "1"));

        expect(harness.attemptsOf("a", "1")).toHaveLength(1);
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

describe("scheduler: interrupted by a server restart", () => {
    it("records the interruption and runs the same attempt again", () => {
        const harness = createSchedulerHarness({ graph: withoutRetries(buildLinearAgentFlow()) });
        harness.start(["1"]);

        harness.restartAfterCrash();
        reportRunningNodeRunsInterrupted(harness);
        harness.runToCompletion();

        expect(statusesOf(harness, "a", "1")).toEqual([
            "PENDING",
            "QUEUED",
            "RUNNING",
            "INTERRUPTED",
            "QUEUED",
            "RUNNING",
            "SUCCEEDED",
        ]);
        expect(harness.attemptsOf("a", "1").map((entry) => entry.attempt)).toEqual([1]);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("keeps the interrupted NodeRuns ahead of the ones queued after them", () => {
        const harness = createSchedulerHarness({
            graph: buildLinearAgentFlow(),
            maxConcurrentAgents: 2,
        });
        harness.start(["1", "2", "3"]);

        harness.restartAfterCrash();
        reportRunningNodeRunsInterrupted(harness);

        const restartedItems = harness
            .agentStartsInOrder()
            .slice(2)
            .map((entry) => entry.workItemId);
        expect(restartedItems).toEqual(["1", "2"]);
    });

    it("cancels the interrupted NodeRun of a run that is stopping", () => {
        const harness = createSchedulerHarness({
            graph: withoutRetries(buildLinearAgentFlow()),
            scripts: { a: failingOn("1") },
        });
        harness.start(["1", "2"]);
        harness.advance(DEFAULT_NODE_DURATION_MS);

        harness.restartAfterCrash();
        reportRunningNodeRunsInterrupted(harness);
        harness.runToCompletion();

        expect(statusesOf(harness, "a", "2").slice(-2)).toEqual(["INTERRUPTED", "CANCELED"]);
        expect(harness.run.status).toBe("FAILED");
    });

    it("ignores an interruption of a NodeRun that is no longer running", () => {
        const harness = createSchedulerHarness({ graph: buildSingleAgentFlow() });
        harness.start(["1"]);
        harness.runToCompletion();
        const [finished] = harness.snapshot().nodeRuns.filter((nodeRun) => nodeRun.nodeId === "a");

        harness.reportInterrupted(finished?.id ?? "");

        expect(harness.finalStatusOf("a", "1")).toBe("SUCCEEDED");
    });

    it("leaves the interrupted NodeRun queued while the run is paused", () => {
        const harness = createSchedulerHarness({ graph: buildSingleAgentFlow() });
        harness.start(["1"]);
        harness.requestPause();

        harness.restartAfterCrash();
        reportRunningNodeRunsInterrupted(harness);
        harness.runToCompletion();

        expect(harness.finalStatusOf("a", "1")).toBe("QUEUED");
        expect(harness.run.status).toBe("PAUSED");
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

describe("scheduler: budget", () => {
    const ONE_DOLLAR_PER_RUN: RunBudget = { run: { maxCostUsd: 1 }, onExceeded: "pause" };

    it("pauses the run with budget before the 4th agent when each agent costs 0.40 of 1", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            maxConcurrentAgents: 1,
            budget: ONE_DOLLAR_PER_RUN,
            scripts: { a: costing(0.4) },
        });

        harness.start(FIVE_ITEMS);
        harness.runToCompletion();

        expect(harness.agentStartsInOrder()).toHaveLength(3);
        expect(harness.finalStatusOf("a", "4")).toBe("QUEUED");
        expect(harness.run.status).toBe("PAUSED");
        expect(harness.run.pauseReason).toBe("budget");
    });

    it("lets the agents already running finish normally when the budget blocks", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            maxConcurrentAgents: 2,
            budget: ONE_DOLLAR_PER_RUN,
            scripts: {
                a: ({ nodeRun }) => ({
                    durationMs: nodeRun.workItemId === "1" ? 1_000 : 5_000,
                    usage: { costUsd: 1, tokens: 0 },
                }),
            },
        });
        harness.start(["1", "2", "3"]);

        harness.advance(1_000);

        expect(harness.run.status).toBe("PAUSED");
        expect(harness.finalStatusOf("a", "2")).toBe("RUNNING");

        harness.runToCompletion();

        expect(harness.finalStatusOf("a", "2")).toBe("SUCCEEDED");
        expect(harness.entriesOf("a", "3").map((entry) => entry.status)).not.toContain("RUNNING");
    });

    it("counts only the spending of the node against its per-node limit", () => {
        const harness = createSchedulerHarness({
            graph: buildLinearAgentFlow(),
            maxConcurrentAgents: 1,
            budget: { perNode: { b: { maxCostUsd: 0.5 } }, onExceeded: "pause" },
            scripts: { a: costing(1), b: costing(0.1) },
        });

        harness.start(["1", "2"]);
        harness.runToCompletion();

        expect(harness.agentStartsInOrder()).toHaveLength(4);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("fails the NodeRun with budget and gives up on it when the budget says fail", () => {
        const harness = createSchedulerHarness({
            graph: withAgentConfig(buildSingleAgentFlow(), "a", { retries: 2 }),
            maxConcurrentAgents: 1,
            budget: { run: { maxCostUsd: 1 }, onExceeded: "fail" },
            scripts: { a: costing(1) },
        });

        harness.start(["1", "2"]);
        harness.runToCompletion();

        expect(harness.attemptsOf("a", "2").map(({ status }) => status)).toEqual(["FAILED"]);
        expect(errorKindsOf(harness, "a")).toEqual([undefined, "budget"]);
        expect(harness.run.status).toBe("FAILED");
    });

    it("blocks only the node over its limit while the other nodes go on", () => {
        const harness = createSchedulerHarness({
            graph: buildMappedLinearFlow(),
            budget: { perNode: { a: { maxCostUsd: 0.4 } }, onExceeded: "fail" },
            scripts: { a: costing(0.4) },
        });

        harness.start(["1", "2"]);
        harness.runToCompletion();

        expect(harness.finalStatusOf("a", "2")).toBe("FAILED");
        expect(harness.finalStatusOf("b", "1")).toBe("SUCCEEDED");
        expect(harness.run.failedItems).toEqual(["2"]);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("resumes the run paused by the budget when the budget is raised", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            maxConcurrentAgents: 1,
            budget: ONE_DOLLAR_PER_RUN,
            scripts: { a: costing(0.4) },
        });
        harness.start(FIVE_ITEMS);
        harness.runToCompletion();

        harness.raiseBudget({ run: { maxCostUsd: 10 }, onExceeded: "pause" });
        harness.runToCompletion();

        expect(harness.agentStartsInOrder()).toHaveLength(5);
        expect(harness.run.status).toBe("SUCCEEDED");
        expect(harness.run.pauseReason).toBeUndefined();
    });

    it("pauses again when the raised budget is still below the spending", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            maxConcurrentAgents: 1,
            budget: ONE_DOLLAR_PER_RUN,
            scripts: { a: costing(0.4) },
        });
        harness.start(FIVE_ITEMS);
        harness.runToCompletion();

        harness.raiseBudget({ run: { maxCostUsd: 1.5 }, onExceeded: "pause" });
        harness.runToCompletion();

        expect(harness.agentStartsInOrder()).toHaveLength(4);
        expect(harness.run.pauseReason).toBe("budget");
    });

    it("remembers the spending after a restore from a snapshot", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            maxConcurrentAgents: 1,
            budget: ONE_DOLLAR_PER_RUN,
            scripts: { a: costing(0.4) },
        });
        harness.start(FIVE_ITEMS);
        harness.advance(2 * DEFAULT_NODE_DURATION_MS);

        harness.restartFromSnapshot();
        harness.runToCompletion();

        expect(harness.agentStartsInOrder()).toHaveLength(3);
        expect(harness.run.pauseReason).toBe("budget");
    });

    it("counts usage reported before the NodeRun succeeds", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            maxConcurrentAgents: 1,
            budget: { run: { maxTokens: 1_000 }, onExceeded: "pause" },
            scripts: { a: () => ({ usage: { costUsd: 0, tokens: 1_000 } }) },
        });

        harness.start(["1", "2"]);
        harness.runToCompletion();

        expect(harness.agentStartsInOrder()).toHaveLength(1);
        expect(harness.run.pauseReason).toBe("budget");
    });
});

describe("scheduler: pause requested by the user", () => {
    const RESET_AT_15H = new Date("2026-01-01T15:00:00Z");
    const AFTER_THE_RESET_MS = 4 * 60 * MINUTE_MS;

    it("pauses the run and starts nothing new while the running agent finishes", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            maxConcurrentAgents: 1,
        });
        harness.start(["1", "2"]);

        harness.requestPause();
        harness.runToCompletion();

        expect(harness.run).toMatchObject({ status: "PAUSED", pauseReason: "user" });
        expect(harness.finalStatusOf("a", "1")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("a", "2")).toBe("QUEUED");
    });

    it("continues a run paused by the user when it is resumed", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            maxConcurrentAgents: 1,
        });
        harness.start(["1", "2"]);
        harness.requestPause();
        harness.runToCompletion();

        harness.requestResume();
        harness.runToCompletion();

        expect(harness.finalStatusOf("a", "2")).toBe("SUCCEEDED");
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("keeps the run paused by the user after the usage limit resets", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            scripts: { a: hittingUsageLimitOnceOn("1", RESET_AT_15H) },
        });
        harness.start(["1"]);
        harness.advance(DEFAULT_NODE_DURATION_MS);

        harness.requestPause();
        harness.advance(AFTER_THE_RESET_MS);

        expect(harness.run).toMatchObject({ status: "PAUSED", pauseReason: "user" });
        expect(harness.run.resumeAt).toBeUndefined();
        expect(harness.finalStatusOf("a", "1")).toBe("WAITING_LIMIT");
    });

    it("runs the NodeRun that waited for the limit once the user resumes", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            scripts: { a: hittingUsageLimitOnceOn("1", RESET_AT_15H) },
        });
        harness.start(["1"]);
        harness.advance(DEFAULT_NODE_DURATION_MS);
        harness.requestPause();

        harness.requestResume();
        harness.runToCompletion();

        expect(harness.finalStatusOf("a", "1")).toBe("SUCCEEDED");
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("ignores a resume of a run that the user did not pause", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            scripts: { a: hittingUsageLimitOnceOn("1", RESET_AT_15H) },
        });
        harness.start(["1"]);
        harness.advance(DEFAULT_NODE_DURATION_MS);

        harness.requestResume();

        expect(harness.run).toMatchObject({ status: "PAUSED", pauseReason: "usage_limit" });
    });
});

describe("scheduler: usage limit", () => {
    const RESET_AT_15H = new Date("2026-01-01T15:00:00Z");
    const RESUME_AT_15H05 = new Date("2026-01-01T15:05:00Z");
    const FALLBACK_WAIT_MS = 30 * MINUTE_MS;
    const RESET_AT_16H = new Date("2026-01-01T16:00:00Z");
    const RESUME_AT_16H05 = new Date("2026-01-01T16:05:00Z");

    it("pauses the run until 5 minutes after the reset time and announces the limit", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            scripts: { a: hittingUsageLimitOnceOn("1", RESET_AT_15H) },
        });
        harness.start(["1"]);

        harness.advance(DEFAULT_NODE_DURATION_MS);

        expect(harness.finalStatusOf("a", "1")).toBe("WAITING_LIMIT");
        expect(harness.run).toMatchObject({
            status: "PAUSED",
            pauseReason: "usage_limit",
            resumeAt: RESUME_AT_15H05,
        });
        expect(usageLimitCommandsOf(harness)).toEqual([
            { type: "usage_limit_reached", resetAt: RESET_AT_15H, resumeAt: RESUME_AT_15H05 },
        ]);
        expect(harness.commands).toContainEqual({ type: "schedule_wakeup", at: RESUME_AT_15H05 });
    });

    it("resumes 30 minutes after the limit when it does not say when it resets", () => {
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            scripts: { a: hittingUsageLimitOnceOn("1") },
        });
        harness.start(["1"]);

        harness.runToCompletion();

        const resumedAtMs = DEFAULT_NODE_DURATION_MS + FALLBACK_WAIT_MS;
        expect(startTimesMsOf(harness, "a", "1")).toEqual([0, resumedAtMs]);
        expect(harness.run.status).toBe("SUCCEEDED");
    });

    it("starts nothing during the pause while the Devs already running finish", () => {
        const harness = createSchedulerHarness({
            graph: withMapConfig(buildMappedLinearFlow(), "map_a", { concurrency: 3 }),
            scripts: { a: devsHittingTheLimit({ "2": RESET_AT_15H }) },
        });
        harness.start(["1", "2", "3"]);

        harness.advance(30 * MINUTE_MS);

        expect(harness.run.status).toBe("PAUSED");
        expect(harness.finalStatusOf("a", "1")).toBe("SUCCEEDED");
        expect(harness.finalStatusOf("a", "2")).toBe("WAITING_LIMIT");
        expect(harness.finalStatusOf("a", "3")).toBe("SUCCEEDED");
        expect(harness.startCommandsOf("b")).toEqual([]);
    });

    it("puts the waiting Dev back in the queue with the same attempt at 15:05", () => {
        const harness = createSchedulerHarness({
            graph: withMapConfig(buildMappedLinearFlow(), "map_a", { concurrency: 3 }),
            scripts: { a: devsHittingTheLimit({ "2": RESET_AT_15H }) },
        });
        harness.start(["1", "2", "3"]);

        harness.clock.set(RESUME_AT_15H05);

        expect(harness.run.status).toBe("RUNNING");
        expect(harness.attemptsOf("a", "2")).toMatchObject([{ attempt: 1, status: "RUNNING" }]);
        expect(harness.finalStatusOf("b", "1")).toBe("RUNNING");
        expect(usageLimitCommandsOf(harness).map((command) => command.type)).toEqual([
            "usage_limit_reached",
            "usage_limit_reset",
        ]);
    });

    it("finishes the run once the Dev that hit the limit succeeds after the reset", () => {
        const harness = createSchedulerHarness({
            graph: withMapConfig(buildMappedLinearFlow(), "map_a", { concurrency: 3 }),
            scripts: { a: devsHittingTheLimit({ "2": RESET_AT_15H }) },
        });
        harness.start(["1", "2", "3"]);

        harness.runToCompletion();

        expect(harness.attemptsOf("a", "2")).toMatchObject([{ attempt: 1, status: "SUCCEEDED" }]);
        expect(harness.finalStatusOf("b", "2")).toBe("SUCCEEDED");
        expect(runStatusesOf(harness)).toEqual(["RUNNING", "PAUSED", "RUNNING", "SUCCEEDED"]);
    });

    it("keeps one pause and waits for the later reset when another Dev hits the limit", () => {
        const harness = createSchedulerHarness({
            graph: withMapConfig(buildMappedLinearFlow(), "map_a", { concurrency: 3 }),
            scripts: { a: devsHittingTheLimit({ "2": RESET_AT_15H, "3": RESET_AT_16H }) },
        });
        harness.start(["1", "2", "3"]);

        harness.clock.set(RESUME_AT_15H05);

        expect(harness.run).toMatchObject({ status: "PAUSED", resumeAt: RESUME_AT_16H05 });
        expect(harness.finalStatusOf("a", "3")).toBe("WAITING_LIMIT");
        expect(usageLimitCommandsOf(harness).map((command) => command.type)).toEqual([
            "usage_limit_reached",
        ]);

        harness.clock.set(RESUME_AT_16H05);

        expect(harness.run.status).toBe("RUNNING");
        expect(harness.attemptsOf("a", "2")).toMatchObject([{ attempt: 1, status: "RUNNING" }]);
        expect(harness.attemptsOf("a", "3")).toMatchObject([{ attempt: 1, status: "RUNNING" }]);
    });

    it("keeps the later resumeAt when another Dev hits a limit that resets sooner", () => {
        const resetAt14h = new Date("2026-01-01T14:00:00Z");
        const harness = createSchedulerHarness({
            graph: withMapConfig(buildMappedLinearFlow(), "map_a", { concurrency: 3 }),
            scripts: { a: devsHittingTheLimit({ "2": RESET_AT_15H, "3": resetAt14h }) },
        });
        harness.start(["1", "2", "3"]);

        harness.advance(30 * MINUTE_MS);

        expect(harness.finalStatusOf("a", "3")).toBe("WAITING_LIMIT");
        expect(harness.run.resumeAt).toEqual(RESUME_AT_15H05);
    });

    it("keeps the run paused when the user paused it during the limit pause", () => {
        const graph = buildSingleAgentFlow();
        const harness = createSchedulerHarness({
            graph,
            scripts: { a: hittingUsageLimitOnceOn("1", RESET_AT_15H) },
        });
        harness.start(["1"]);
        harness.advance(DEFAULT_NODE_DURATION_MS);
        const snapshot = harness.snapshot();
        const pausedByUser: SchedulerSnapshot = {
            ...snapshot,
            run: { ...snapshot.run, pauseReason: "user" },
        };
        const scheduler = createScheduler(
            graph,
            buildRunState(),
            singleAgentSchedulerOptions(),
            pausedByUser,
        );

        const commands = scheduler.tick(RESUME_AT_15H05);

        expect(commands).toEqual([]);
        expect(scheduler.snapshot().run).toMatchObject({ status: "PAUSED", pauseReason: "user" });
    });

    it("cancels the NodeRuns waiting for the limit when the run fails during the pause", () => {
        const limitOnItem1 = hittingUsageLimitOnceOn("1", RESET_AT_15H);
        const harness = createSchedulerHarness({
            graph: withoutRetries(buildSingleAgentFlow()),
            scripts: {
                a: (started) =>
                    started.nodeRun.workItemId === "2"
                        ? { durationMs: 5_000, outcome: FAILED_FOR_GOOD }
                        : limitOnItem1(started),
            },
        });
        harness.start(["1", "2"]);

        harness.runToCompletion();

        expect(harness.finalStatusOf("a", "1")).toBe("CANCELED");
        expect(startTimesMsOf(harness, "a", "1")).toEqual([0]);
        expect(harness.run.status).toBe("FAILED");
    });

    it("takes over a budget pause and lets the budget pause the run again after the reset", () => {
        const limitOnItem2 = hittingUsageLimitOnceOn("2", RESET_AT_15H);
        const harness = createSchedulerHarness({
            graph: buildSingleAgentFlow(),
            maxConcurrentAgents: 2,
            budget: { run: { maxCostUsd: 1 }, onExceeded: "pause" },
            scripts: {
                a: (started) => ({
                    durationMs: 5_000,
                    usage: { costUsd: 1, tokens: 0 },
                    ...limitOnItem2(started),
                }),
            },
        });
        harness.start(["1", "2", "3"]);

        harness.advance(5_000);

        expect(harness.run).toMatchObject({
            pauseReason: "usage_limit",
            resumeAt: RESUME_AT_15H05,
        });

        harness.clock.set(RESUME_AT_15H05);

        expect(harness.run).toMatchObject({ status: "PAUSED", pauseReason: "budget" });
        expect(harness.attemptsOf("a", "2")).toMatchObject([{ attempt: 1, status: "QUEUED" }]);
    });

    it("does not spend a retry when the agent hits the limit", () => {
        const harness = createSchedulerHarness({
            graph: withoutRetries(buildSingleAgentFlow()),
            scripts: { a: hittingUsageLimitOnceOn("1", RESET_AT_15H) },
        });
        harness.start(["1"]);

        harness.runToCompletion();

        expect(harness.attemptsOf("a", "1")).toMatchObject([{ attempt: 1, status: "SUCCEEDED" }]);
        expect(harness.run.status).toBe("SUCCEEDED");
    });
});

function failingWith(error: NodeRunError): NodeScript {
    return () => ({ outcome: { kind: "fail", error } });
}

function costing(costUsd: number): NodeScript {
    return () => ({ usage: { costUsd, tokens: 0 } });
}

function latestNodeRunIdOf(harness: SchedulerHarness, nodeId: string, itemId: string): string {
    return harness.attemptsOf(nodeId, itemId).at(-1)?.nodeRunId ?? "";
}

function singleAgentSchedulerOptions(): SchedulerOptions {
    return {
        maxConcurrentAgents: 1,
        minStartIntervalMs: 0,
        newId: sequentialIds(),
        usageLimitMarginMinutes: DEFAULT_USAGE_LIMIT_MARGIN_MINUTES,
    };
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

function failingOnFirstAttemptOf(failingItemId: string, error: NodeRunError): NodeScript {
    return ({ nodeRun }) => {
        const isFailing = nodeRun.workItemId === failingItemId && nodeRun.attempt === 1;

        return isFailing ? { outcome: { kind: "fail", error } } : {};
    };
}

function runStatusesOf(harness: SchedulerHarness): string[] {
    return harness.commands.flatMap((command) =>
        command.type === "run_changed" ? [command.run.status] : [],
    );
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

function hittingUsageLimitOnceOn(limitedItemId: string, resetAt?: Date): NodeScript {
    const limitedNodeRunIds = new Set<string>();

    return ({ nodeRun }) => {
        if (nodeRun.workItemId !== limitedItemId || limitedNodeRunIds.has(nodeRun.id)) {
            return {};
        }

        limitedNodeRunIds.add(nodeRun.id);

        return { outcome: { kind: "hit_usage_limit", resetAt } };
    };
}

function devsHittingTheLimit(resetAtByItem: Record<string, Date>): NodeScript {
    const limitScriptsByItem = new Map(
        Object.entries(resetAtByItem).map(([itemId, resetAt]) => [
            itemId,
            hittingUsageLimitOnceOn(itemId, resetAt),
        ]),
    );

    return (started) => {
        const itemId = started.nodeRun.workItemId ?? "";
        const workMinutes = DEV_WORK_MINUTES_BY_ITEM[itemId] ?? 1;
        const limitHit = limitScriptsByItem.get(itemId)?.(started) ?? {};

        return { durationMs: workMinutes * MINUTE_MS, ...limitHit };
    };
}

function usageLimitCommandsOf(harness: SchedulerHarness): SchedulerCommand[] {
    return harness.commands.filter(
        (command) => command.type === "usage_limit_reached" || command.type === "usage_limit_reset",
    );
}

function reportRunningNodeRunsInterrupted(harness: SchedulerHarness): void {
    harness
        .snapshot()
        .nodeRuns.filter((nodeRun) => nodeRun.status === "RUNNING")
        .forEach((nodeRun) => harness.reportInterrupted(nodeRun.id));
}

function statusesOf(harness: SchedulerHarness, nodeId: string, workItemId: string): string[] {
    return harness.entriesOf(nodeId, workItemId).map((entry) => entry.status);
}

function failingOn(failingItemId: string): NodeScript {
    return ({ nodeRun }) => {
        if (nodeRun.workItemId !== failingItemId) {
            return { durationMs: 4 * DEFAULT_NODE_DURATION_MS };
        }

        return { outcome: FAILED_FOR_GOOD };
    };
}
