import type { NodeRunState } from "@/engine/node_run_state.js";
import { collectUpstreamOutputs } from "@/engine/upstream_outputs.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";

type FindNodeRun = (nodeId: string, workItemId: string | undefined) => NodeRunState | undefined;

// Like the scheduler's registry: the latest NodeRun of each node and item wins.
function findLatestNodeRunAmong(nodeRuns: NodeRunState[]): FindNodeRun {
    return (nodeId, workItemId) =>
        nodeRuns.findLast(
            (nodeRun) => nodeRun.nodeId === nodeId && nodeRun.workItemId === workItemId,
        );
}

function succeededRun(
    nodeId: string,
    workItemId: string | undefined,
    outputs: Record<string, unknown>,
): NodeRunState {
    return buildNodeRunState({
        id: `${nodeId}-${workItemId}`,
        nodeId,
        workItemId,
        status: "SUCCEEDED",
        outputs,
    });
}

describe("collectUpstreamOutputs", () => {
    it("reads a node that runs per item from the NodeRun of the same item", () => {
        const findNodeRun = findLatestNodeRunAmong([
            succeededRun("tl", "item-1", { summary: "Especificação do item 1" }),
            succeededRun("tl", "item-2", { summary: "Especificação do item 2" }),
        ]);

        const outputs = collectUpstreamOutputs(buildCanonicalFlow(), "dev", "item-1", findNodeRun);

        expect(outputs.tl).toEqual({ summary: "Especificação do item 1" });
    });

    it("reads a node that runs once per run from the NodeRun without item", () => {
        const findNodeRun = findLatestNodeRunAmong([
            succeededRun("source", undefined, { items: [{ id: "item-1" }] }),
        ]);

        const outputs = collectUpstreamOutputs(buildCanonicalFlow(), "dev", "item-1", findNodeRun);

        expect(outputs.fonte).toEqual({ items: [{ id: "item-1" }] });
    });

    it("leaves out the upstream nodes that did not run or were skipped", () => {
        const findNodeRun = findLatestNodeRunAmong([
            { ...succeededRun("tl", "item-1", {}), status: "SKIPPED", outputs: undefined },
        ]);

        const outputs = collectUpstreamOutputs(buildCanonicalFlow(), "dev", "item-1", findNodeRun);

        expect(outputs).toEqual({});
    });

    it("reads the attempt that succeeded after a failed one", () => {
        const findNodeRun = findLatestNodeRunAmong([
            { ...succeededRun("tl", "item-1", {}), attempt: 1, status: "FAILED" },
            { ...succeededRun("tl", "item-1", { summary: "Segunda tentativa" }), attempt: 2 },
        ]);

        const outputs = collectUpstreamOutputs(buildCanonicalFlow(), "dev", "item-1", findNodeRun);

        expect(outputs.tl).toEqual({ summary: "Segunda tentativa" });
    });

    it("leaves out a node whose latest attempt failed", () => {
        const findNodeRun = findLatestNodeRunAmong([
            { ...succeededRun("tl", "item-1", { summary: "Parcial" }), status: "FAILED" },
        ]);

        const outputs = collectUpstreamOutputs(buildCanonicalFlow(), "dev", "item-1", findNodeRun);

        expect(outputs).not.toHaveProperty("tl");
    });

    it("leaves out the nodes that come after the node", () => {
        const findNodeRun = findLatestNodeRunAmong([
            succeededRun("reviewer", "item-1", { summary: "Aprovado" }),
        ]);

        const outputs = collectUpstreamOutputs(buildCanonicalFlow(), "dev", "item-1", findNodeRun);

        expect(outputs).not.toHaveProperty("reviewer");
    });
});
