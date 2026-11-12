import type { SerializedNodeRun, SerializedRunView } from "@/shared/run_types.js";
import {
    buildSerializedNodeRun,
    buildSerializedRunView,
} from "@/test/factories/run_view_factory.js";
import { aggregateNodeStates } from "@/web/canvas/live/run_view_model.js";

const DEVELOPER_NODE_ID = "dev";
const DEVELOP_GROUP_ID = "develop";

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

function viewWithDeveloperRuns(nodeRuns: Partial<SerializedNodeRun>[]): SerializedRunView {
    return buildSerializedRunView({
        nodeRuns: nodeRuns.map((nodeRun, index) =>
            buildSerializedNodeRun({
                id: `node-run-${index}`,
                nodeId: DEVELOPER_NODE_ID,
                ...nodeRun,
            }),
        ),
    });
}
