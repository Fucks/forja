import { diffFlowGraphs } from "@/engine/graph_diff.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import {
    addNodes,
    removeNodes,
    updateAgentConfig,
    updateNode,
} from "@/test/factories/flow_graph_variations.js";

const NEW_NODE_POSITION = { x: 900, y: 900 };

function findNode(graph: FlowGraph, nodeId: string): FlowNode {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
        throw new Error(`Node ${nodeId} not found`);
    }

    return node;
}

describe("diffFlowGraphs", () => {
    it("finds no differences between equal graphs", () => {
        const diff = diffFlowGraphs(buildCanonicalFlow(), buildCanonicalFlow());

        expect(diff).toEqual({
            addedNodes: [],
            removedNodes: [],
            changedNodes: [],
            addedEdges: [],
            removedEdges: [],
            addedGroups: [],
            removedGroups: [],
            changedGroups: [],
        });
    });

    describe("nodes", () => {
        it("ignores nodes that only moved", () => {
            const moved = updateNode(buildCanonicalFlow(), "reviewer", (node) => ({
                ...node,
                position: { x: node.position.x + 40, y: node.position.y - 15 },
            }));

            const diff = diffFlowGraphs(buildCanonicalFlow(), moved);

            expect(diff.changedNodes).toEqual([]);
        });

        it("lists the nodes only the newer graph has as added", () => {
            const notifier = createDefaultNode("script", "notify", NEW_NODE_POSITION);
            const after = addNodes(buildCanonicalFlow(), [notifier]);

            const diff = diffFlowGraphs(buildCanonicalFlow(), after);

            expect(diff.addedNodes).toEqual([notifier]);
            expect(diff.removedNodes).toEqual([]);
        });

        it("lists the nodes only the older graph has as removed", () => {
            const before = buildCanonicalFlow();
            const after = removeNodes(before, ["tl"]);

            const diff = diffFlowGraphs(before, after);

            expect(diff.removedNodes.map((node) => node.id)).toEqual(["tl"]);
            expect(diff.addedNodes).toEqual([]);
        });

        it("reports a changed config field by its path, with the node's label", () => {
            const before = updateAgentConfig(buildCanonicalFlow(), "reviewer", {
                effort: "medium",
            });
            const after = updateAgentConfig(buildCanonicalFlow(), "reviewer", { effort: "high" });

            const diff = diffFlowGraphs(before, after);

            expect(diff.changedNodes).toEqual([
                {
                    nodeId: "reviewer",
                    label: "Reviewer",
                    changes: [{ path: "config.effort", before: "medium", after: "high" }],
                },
            ]);
        });

        it("labels a renamed node with its newer label", () => {
            const after = updateNode(buildCanonicalFlow(), "reviewer", (node) => ({
                ...node,
                label: "Revisor",
            }));

            const diff = diffFlowGraphs(buildCanonicalFlow(), after);

            expect(diff.changedNodes).toEqual([
                {
                    nodeId: "reviewer",
                    label: "Revisor",
                    changes: [{ path: "label", before: "Reviewer", after: "Revisor" }],
                },
            ]);
        });

        it("reports a field that only one graph sets", () => {
            const after = updateNode(buildCanonicalFlow(), "tl", (node) => ({
                ...node,
                parentGroupId: undefined,
            }));

            const diff = diffFlowGraphs(buildCanonicalFlow(), after);

            expect(diff.changedNodes[0]?.changes).toEqual([
                { path: "parentGroupId", before: "specify", after: undefined },
            ]);
        });

        it("compares lists as a whole", () => {
            const before = buildCanonicalFlow();
            const extraOutput = { name: "notes", type: "text", required: true } as const;
            const after = updateNode(before, "dev", (node) => ({
                ...node,
                outputs: [...node.outputs, extraOutput],
            }));
            const developerOutputs = findNode(before, "dev").outputs;

            const diff = diffFlowGraphs(before, after);

            expect(diff.changedNodes[0]?.changes).toEqual([
                {
                    path: "outputs",
                    before: developerOutputs,
                    after: [...developerOutputs, extraOutput],
                },
            ]);
        });
    });
});
