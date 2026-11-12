import type { EventEnvelope, ForjaEvent } from "@/shared/events.js";
import type { SerializedNodeRun, SerializedRunView } from "@/shared/run_types.js";
import {
    buildSerializedNodeRun,
    buildSerializedRunView,
} from "@/test/factories/run_view_factory.js";
import {
    aggregateNodeStates,
    applyEvent,
    flowingEdges,
    listRunItems,
} from "@/web/canvas/live/run_view_model.js";

const DEVELOPER_NODE_ID = "dev";
const DEVELOP_GROUP_ID = "develop";
const SPEC_TO_DEVELOPER_EDGE_ID = "tl.summary->dev.spec";
const SOURCE_TO_SPEC_EDGE_ID = "source.items->tl.item";
const EVENT_AT = "2026-01-01T12:10:00.000Z";
const RESUME_AT = "2026-01-01T15:05:00.000Z";

describe("aggregateNodeStates", () => {
    it("shows every node of the graph as pending before it runs", () => {
        const view = buildSerializedRunView();

        const liveStates = aggregateNodeStates(view);

        expect(liveStates.get("trigger")).toEqual({ status: "PENDING" });
        expect(liveStates.get(DEVELOPER_NODE_ID)).toEqual({ status: "PENDING" });
    });

    it("shows the node as running when any of its items is running", () => {
        const view = viewWithDeveloperRuns([
            { workItemId: "41", status: "SUCCEEDED" },
            { workItemId: "42", status: "RUNNING" },
            { workItemId: "43", status: "QUEUED" },
        ]);

        expect(aggregateNodeStates(view).get(DEVELOPER_NODE_ID)?.status).toBe("RUNNING");
    });

    it("shows the node as waiting when nothing runs and an item waits", () => {
        const view = viewWithDeveloperRuns([
            { workItemId: "41", status: "QUEUED" },
            { workItemId: "42", status: "WAITING_LIMIT" },
        ]);

        expect(aggregateNodeStates(view).get(DEVELOPER_NODE_ID)?.status).toBe("WAITING_LIMIT");
    });

    it("shows the node as queued when nothing runs or waits and an item is queued", () => {
        const view = viewWithDeveloperRuns([
            { workItemId: "41", status: "SUCCEEDED" },
            { workItemId: "42", status: "QUEUED" },
        ]);

        expect(aggregateNodeStates(view).get(DEVELOPER_NODE_ID)?.status).toBe("QUEUED");
    });

    it("shows the node as failed when its last NodeRun failed", () => {
        const view = viewWithDeveloperRuns([
            { workItemId: "41", status: "SUCCEEDED" },
            { workItemId: "42", status: "FAILED" },
        ]);

        expect(aggregateNodeStates(view).get(DEVELOPER_NODE_ID)?.status).toBe("FAILED");
    });

    it("shows the node as succeeded when every item concluded", () => {
        const view = viewWithDeveloperRuns([
            { workItemId: "41", status: "SUCCEEDED" },
            { workItemId: "42", status: "SUCCEEDED" },
        ]);

        expect(aggregateNodeStates(view).get(DEVELOPER_NODE_ID)?.status).toBe("SUCCEEDED");
    });

    it("judges an item by its latest attempt", () => {
        const view = viewWithDeveloperRuns([
            { workItemId: "42", status: "FAILED", attempt: 1 },
            { workItemId: "42", status: "SUCCEEDED", attempt: 2 },
        ]);

        expect(aggregateNodeStates(view).get(DEVELOPER_NODE_ID)?.status).toBe("SUCCEEDED");
    });

    it("names the item running on the node in its badge", () => {
        const view = viewWithDeveloperRuns([
            { workItemId: "41", status: "SUCCEEDED" },
            { workItemId: "42", status: "RUNNING" },
        ]);

        expect(aggregateNodeStates(view).get(DEVELOPER_NODE_ID)?.badge).toBe("item #42");
    });

    it("counts the items running on the node in its badge", () => {
        const view = viewWithDeveloperRuns([
            { workItemId: "41", status: "RUNNING" },
            { workItemId: "42", status: "RUNNING" },
            { workItemId: "43", status: "RUNNING" },
        ]);

        expect(aggregateNodeStates(view).get(DEVELOPER_NODE_ID)?.badge).toBe("3 itens");
    });

    it("gives each map group the counters of the run view", () => {
        const progress = { queued: 1, running: 2, succeeded: 4, failed: 0 };
        const view = buildSerializedRunView({ groups: { [DEVELOP_GROUP_ID]: progress } });

        expect(aggregateNodeStates(view).get(DEVELOP_GROUP_ID)).toEqual({ progress });
    });
});

describe("aggregateNodeStates filtered by item", () => {
    it("shows only the state of the chosen item", () => {
        const view = viewWithDeveloperRuns([
            { workItemId: "41", status: "RUNNING" },
            { workItemId: "42", status: "SUCCEEDED" },
        ]);

        const liveStates = aggregateNodeStates(view, "42");

        expect(liveStates.get(DEVELOPER_NODE_ID)).toEqual({ status: "SUCCEEDED" });
    });

    it("keeps the NodeRuns that belong to every item", () => {
        const view = buildSerializedRunView({
            nodeRuns: [buildSerializedNodeRun({ nodeId: "source", status: "SUCCEEDED" })],
        });

        expect(aggregateNodeStates(view, "42").get("source")?.status).toBe("SUCCEEDED");
    });

    it("counts only the chosen item in the map counters", () => {
        const view = {
            ...viewWithDeveloperRuns([
                { workItemId: "41", status: "RUNNING" },
                { workItemId: "42", status: "SUCCEEDED" },
            ]),
            groups: { [DEVELOP_GROUP_ID]: { queued: 0, running: 1, succeeded: 1, failed: 0 } },
        };

        const liveStates = aggregateNodeStates(view, "42");

        expect(liveStates.get(DEVELOP_GROUP_ID)).toEqual({
            progress: { queued: 0, running: 0, succeeded: 1, failed: 0 },
        });
    });
});

describe("applyEvent", () => {
    it("adds the NodeRun that a node_run.updated announces", () => {
        const view = buildSerializedRunView();

        const updated = applyEvent(view, envelopeOf(nodeRunUpdated({ status: "RUNNING" })));

        expect(updated.nodeRuns).toEqual([
            buildSerializedNodeRun({
                id: "node-run-7",
                nodeId: DEVELOPER_NODE_ID,
                workItemId: "42",
                status: "RUNNING",
            }),
        ]);
    });

    it("changes the status of a NodeRun the view already has", () => {
        const view = applyEvent(
            buildSerializedRunView(),
            envelopeOf(nodeRunUpdated({ status: "RUNNING" }), 1),
        );

        const updated = applyEvent(view, envelopeOf(nodeRunUpdated({ status: "SUCCEEDED" }), 2));

        expect(updated.nodeRuns.map((nodeRun) => nodeRun.status)).toEqual(["SUCCEEDED"]);
    });

    it("replaces the counters of the group a group.progress names", () => {
        const view = buildSerializedRunView();

        const updated = applyEvent(
            view,
            envelopeOf({
                type: "group.progress",
                runId: "run-1",
                projectId: "project-1",
                groupId: DEVELOP_GROUP_ID,
                queued: 1,
                running: 2,
                succeeded: 3,
                failed: 0,
            }),
        );

        expect(updated.groups[DEVELOP_GROUP_ID]).toEqual({
            queued: 1,
            running: 2,
            succeeded: 3,
            failed: 0,
        });
    });

    it("finishes the run when run.finished arrives", () => {
        const view = buildSerializedRunView();

        const updated = applyEvent(
            view,
            envelopeOf({
                type: "run.finished",
                runId: "run-1",
                projectId: "project-1",
                flowId: "flow-1",
                status: "SUCCEEDED",
            }),
        );

        expect(updated.run).toMatchObject({ status: "SUCCEEDED", finishedAt: EVENT_AT });
    });

    it("runs a reopened run again after it had finished", () => {
        const finishedRun = {
            ...buildSerializedRunView().run,
            status: "FAILED" as const,
            finishedAt: EVENT_AT,
        };
        const view = buildSerializedRunView({ run: finishedRun });

        const updated = applyEvent(
            view,
            envelopeOf({
                type: "run.started",
                runId: "run-1",
                projectId: "project-1",
                flowId: "flow-1",
                status: "RUNNING",
            }),
        );

        expect(updated.run.status).toBe("RUNNING");
        expect(updated.run.finishedAt).toBeUndefined();
    });

    it("pauses the run with the reason and resume time of run.paused", () => {
        const view = buildSerializedRunView();

        const updated = applyEvent(
            view,
            envelopeOf({
                type: "run.paused",
                runId: "run-1",
                projectId: "project-1",
                reason: "usage_limit",
                resumeAt: RESUME_AT,
            }),
        );

        expect(updated.run).toMatchObject({
            status: "PAUSED",
            pauseReason: "usage_limit",
            resumeAt: RESUME_AT,
        });
    });

    it("clears the pause when run.resumed arrives", () => {
        const pausedRun = {
            ...buildSerializedRunView().run,
            status: "PAUSED" as const,
            pauseReason: "user" as const,
        };
        const view = buildSerializedRunView({ run: pausedRun });

        const updated = applyEvent(
            view,
            envelopeOf({ type: "run.resumed", runId: "run-1", projectId: "project-1" }),
        );

        expect(updated.run.status).toBe("RUNNING");
        expect(updated.run.pauseReason).toBeUndefined();
    });

    it("remembers the id of the last event it applied", () => {
        const view = buildSerializedRunView({ lastEventId: 10 });

        const updated = applyEvent(view, envelopeOf(nodeRunUpdated({ status: "RUNNING" }), 11));

        expect(updated.lastEventId).toBe(11);
    });

    it("ignores an event the view already reflects", () => {
        const view = buildSerializedRunView({ lastEventId: 10 });

        const updated = applyEvent(view, envelopeOf(nodeRunUpdated({ status: "RUNNING" }), 10));

        expect(updated).toBe(view);
    });
});

describe("flowingEdges", () => {
    it("animates the edge into a node running an item its source just concluded", () => {
        const view = viewWithNodeRuns([
            { nodeId: "tl", workItemId: "42", status: "SUCCEEDED" },
            { nodeId: DEVELOPER_NODE_ID, workItemId: "42", status: "RUNNING" },
        ]);

        expect(flowingEdges(view)).toEqual(new Set([SPEC_TO_DEVELOPER_EDGE_ID]));
    });

    it("does not animate the edge when the running item came from another source run", () => {
        const view = viewWithNodeRuns([
            { nodeId: "tl", workItemId: "41", status: "SUCCEEDED" },
            { nodeId: "tl", workItemId: "42", status: "RUNNING" },
            { nodeId: DEVELOPER_NODE_ID, workItemId: "41", status: "SUCCEEDED" },
        ]);

        expect(flowingEdges(view)).toEqual(new Set());
    });

    it("animates the edge from a node that ran once for every item", () => {
        const view = viewWithNodeRuns([
            { nodeId: "source", status: "SUCCEEDED" },
            { nodeId: "tl", workItemId: "42", status: "RUNNING" },
        ]);

        expect(flowingEdges(view)).toEqual(new Set([SOURCE_TO_SPEC_EDGE_ID]));
    });
});

describe("listRunItems", () => {
    it("lists the items of the run and the ones its NodeRuns brought, once each", () => {
        const view = {
            ...viewWithDeveloperRuns([
                { workItemId: "41", status: "SUCCEEDED" },
                { workItemId: "42", status: "RUNNING" },
            ]),
            run: { ...buildSerializedRunView().run, itemIds: ["41"] },
        };

        expect(listRunItems(view)).toEqual(["41", "42"]);
    });
});

function viewWithDeveloperRuns(nodeRuns: Partial<SerializedNodeRun>[]): SerializedRunView {
    return viewWithNodeRuns(nodeRuns.map((nodeRun) => ({ nodeId: DEVELOPER_NODE_ID, ...nodeRun })));
}

function viewWithNodeRuns(nodeRuns: Partial<SerializedNodeRun>[]): SerializedRunView {
    return buildSerializedRunView({
        nodeRuns: nodeRuns.map((nodeRun, index) =>
            buildSerializedNodeRun({
                id: `node-run-${index}`,
                ...nodeRun,
            }),
        ),
    });
}

function nodeRunUpdated(
    overrides: Partial<Extract<ForjaEvent, { type: "node_run.updated" }>>,
): ForjaEvent {
    return {
        type: "node_run.updated",
        runId: "run-1",
        projectId: "project-1",
        nodeRunId: "node-run-7",
        nodeId: DEVELOPER_NODE_ID,
        workItemId: "42",
        status: "PENDING",
        attempt: 1,
        iteration: 0,
        ...overrides,
    };
}

function envelopeOf(event: ForjaEvent, id = 1): EventEnvelope {
    return { id, at: EVENT_AT, event };
}
