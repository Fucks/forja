import { diffFlowGraphs } from "@/engine/graph_diff.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { buildCanonicalFlow, connect } from "@/test/factories/flow_graph_factory.js";
import {
    addEdges,
    addGroups,
    addNodes,
    buildMapGroup,
    findEdge,
    removeEdges,
    removeGroups,
    removeNodes,
    updateAgentConfig,
    updateGroup,
    updateNode,
} from "@/test/factories/flow_graph_variations.js";

const NEW_NODE_POSITION = { x: 900, y: 900 };
const DEV_TO_REVIEWER_EDGE_ID = "dev.summary->reviewer.context";

function findNode(graph: FlowGraph, nodeId: string): FlowNode {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
        throw new Error(`Node ${nodeId} not found`);
    }

    return node;
}

function findMapConcurrency(graph: FlowGraph, groupId: string): number {
    const group = graph.groups.find((candidate) => candidate.id === groupId);
    if (group?.kind !== "map") {
        throw new Error(`Map group ${groupId} not found`);
    }

    return group.config.concurrency;
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
    describe("edges", () => {
        it("lists new and dropped connections", () => {
            const before = buildCanonicalFlow();
            const newEdge = connect(["tl", "summary"], ["reviewer", "context"]);
            const after = addEdges(removeEdges(before, [DEV_TO_REVIEWER_EDGE_ID]), [newEdge]);

            const diff = diffFlowGraphs(before, after);

            expect(diff.addedEdges).toEqual([newEdge]);
            expect(diff.removedEdges).toEqual([findEdge(before, DEV_TO_REVIEWER_EDGE_ID)]);
        });

        it("treats an edge re-created with another id as the same connection", () => {
            const before = buildCanonicalFlow();
            const recreated = { ...findEdge(before, DEV_TO_REVIEWER_EDGE_ID), id: "e_novo" };
            const after = addEdges(removeEdges(before, [DEV_TO_REVIEWER_EDGE_ID]), [recreated]);

            const diff = diffFlowGraphs(before, after);

            expect(diff.addedEdges).toEqual([]);
            expect(diff.removedEdges).toEqual([]);
        });
    });

    describe("groups", () => {
        it("lists added and removed groups", () => {
            const before = buildCanonicalFlow();
            const batchGroup = buildMapGroup("batch");
            const after = addGroups(removeGroups(before, ["specify"]), [batchGroup]);

            const diff = diffFlowGraphs(before, after);

            expect(diff.addedGroups).toEqual([batchGroup]);
            expect(diff.removedGroups.map((group) => group.id)).toEqual(["specify"]);
        });

        it("ignores groups that were only moved or resized", () => {
            const after = updateGroup(buildCanonicalFlow(), "develop", (group) => ({
                ...group,
                position: { x: group.position.x + 10, y: group.position.y + 10 },
                size: { width: group.size.width * 2, height: group.size.height * 2 },
            }));

            const diff = diffFlowGraphs(buildCanonicalFlow(), after);

            expect(diff.changedGroups).toEqual([]);
        });

        it("reports a changed group config by its path", () => {
            const after = updateGroup(buildCanonicalFlow(), "develop", (group) =>
                group.kind === "map"
                    ? { ...group, config: { ...group.config, concurrency: 4 } }
                    : group,
            );
            const beforeConcurrency = findMapConcurrency(buildCanonicalFlow(), "develop");

            const diff = diffFlowGraphs(buildCanonicalFlow(), after);

            expect(diff.changedGroups).toEqual([
                {
                    groupId: "develop",
                    changes: [{ path: "config.concurrency", before: beforeConcurrency, after: 4 }],
                },
            ]);
        });
    });
});
