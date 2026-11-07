import {
    buildConditionFlow,
    buildLinearAgentFlow,
    buildSingleAgentFlow,
    buildSourceFlow,
} from "@/test/factories/scheduler_flows.js";
import {
    createSchedulerHarness,
    DEFAULT_NODE_DURATION_MS,
} from "@/test/factories/scheduler_harness.js";

const APPROVED = { op: "eq", path: "approved", value: true } as const;

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
                        const error = { kind: "runtime", message: "boom" } as const;
                        return { durationMs: 1_000, outcome: { kind: "fail", error } };
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
