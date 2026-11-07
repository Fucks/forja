import type { NodeRunError } from "@/engine/node_run_state.js";
import type { Condition } from "@/shared/conditions.js";
import {
    buildConditionFlow,
    buildLinearAgentFlow,
    buildMappedLinearFlow,
    buildReportedCanonicalFlow,
    buildSingleAgentFlow,
    buildSourceFlow,
    withMapConfig,
} from "@/test/factories/scheduler_flows.js";
import {
    createSchedulerHarness,
    DEFAULT_NODE_DURATION_MS,
    type NodeScript,
    type SchedulerHarness,
    type SchedulerHarnessOptions,
} from "@/test/factories/scheduler_harness.js";

const APPROVED: Condition = { op: "eq", path: "approved", value: true };
const RUNTIME_ERROR: NodeRunError = { kind: "runtime", message: "boom" };
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
            graph: buildLinearAgentFlow(),
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
        const harness = createCanonicalHarness({ scripts: { dev: developerFailingItem("2") } });

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
            graph: withMapConfig(buildReportedCanonicalFlow(), "develop", { failFast: true }),
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
