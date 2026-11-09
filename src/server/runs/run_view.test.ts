import type { NodeRunState } from "@/engine/node_run_state.js";
import { buildRunView } from "@/server/runs/run_view.js";
import type { NodeRunStatusName } from "@/shared/events.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildRunRecord } from "@/test/factories/run_record_factory.js";

const GRAPH = buildCanonicalFlow();
const RUN = buildRunRecord({ status: "RUNNING" });
const NO_PROGRESS = { queued: 0, running: 0, succeeded: 0, failed: 0 };

let nextNodeRunNumber = 0;

function nodeRunOf(
    nodeId: string,
    workItemId: string,
    status: NodeRunStatusName,
    attempt = 1,
): NodeRunState {
    nextNodeRunNumber += 1;
    return buildNodeRunState({
        id: `nrn_${nextNodeRunNumber}`,
        runId: RUN.id,
        nodeId,
        workItemId,
        status,
        attempt,
    });
}

describe("buildRunView", () => {
    it("carries the run with its flow name, the NodeRuns, the graph and the last event id", () => {
        const nodeRuns = [nodeRunOf("tl", "itm_1", "RUNNING")];

        const view = buildRunView(RUN, nodeRuns, GRAPH, "Entrega", 42);

        expect(view.run).toEqual({ ...RUN, flowName: "Entrega" });
        expect(view.nodeRuns).toEqual(nodeRuns);
        expect(view.graph).toBe(GRAPH);
        expect(view.lastEventId).toBe(42);
    });

    it("reports every map with no progress before any NodeRun", () => {
        const view = buildRunView(RUN, [], GRAPH, "Entrega", 0);

        expect(view.groups).toEqual({
            specify: NO_PROGRESS,
            develop: NO_PROGRESS,
            review_and_open_pr: NO_PROGRESS,
        });
    });

    it("counts each item of a map by the state of its NodeRuns there", () => {
        const nodeRuns = [
            nodeRunOf("dev", "itm_1", "RUNNING"),
            nodeRunOf("dev", "itm_2", "SUCCEEDED"),
            nodeRunOf("dev", "itm_3", "FAILED"),
            nodeRunOf("dev", "itm_4", "QUEUED"),
        ];

        const view = buildRunView(RUN, nodeRuns, GRAPH, "Entrega", 0);

        expect(view.groups.develop).toEqual({ queued: 1, running: 1, succeeded: 1, failed: 1 });
    });

    it("counts only the latest attempt of a retried NodeRun", () => {
        const nodeRuns = [
            nodeRunOf("dev", "itm_1", "FAILED", 1),
            nodeRunOf("dev", "itm_1", "RUNNING", 2),
        ];

        const view = buildRunView(RUN, nodeRuns, GRAPH, "Entrega", 0);

        expect(view.groups.develop).toEqual({ ...NO_PROGRESS, running: 1 });
    });

    it("counts an item as succeeded only when every node of the map succeeded", () => {
        const nodeRuns = [
            nodeRunOf("reviewer", "itm_1", "SUCCEEDED"),
            nodeRunOf("reviewer", "itm_2", "SUCCEEDED"),
            nodeRunOf("open_pr", "itm_2", "SUCCEEDED"),
            nodeRunOf("output", "itm_2", "SKIPPED"),
        ];

        const view = buildRunView(RUN, nodeRuns, GRAPH, "Entrega", 0);

        expect(view.groups.review_and_open_pr).toEqual({ ...NO_PROGRESS, queued: 1, succeeded: 1 });
    });
});
