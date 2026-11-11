import type { FlowNode } from "@/shared/flow_graph.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { updateAgentConfig, updateNode } from "@/test/factories/flow_graph_variations.js";
import { isSameFlowGraph } from "@/web/app/flows/use_draft_differs.js";

describe("isSameFlowGraph", () => {
    it("treats graphs that differ only in the order of their nodes as the same", () => {
        const graph = buildCanonicalFlow();
        const reordered = { ...graph, nodes: graph.nodes.toReversed() };

        expect(isSameFlowGraph(graph, reordered)).toBe(true);
    });

    it("treats configs with the same fields in another key order as the same", () => {
        const graph = updateNode(buildCanonicalFlow(), "dev", movePromptToTheEnd);

        expect(isSameFlowGraph(buildCanonicalFlow(), graph)).toBe(true);
    });

    it("ignores sub-pixel differences in positions", () => {
        const graph = updateNode(buildCanonicalFlow(), "dev", (node) => ({
            ...node,
            position: { x: node.position.x + 0.2, y: node.position.y - 0.2 },
        }));

        expect(isSameFlowGraph(buildCanonicalFlow(), graph)).toBe(true);
    });

    it("tells apart graphs with a different config", () => {
        const graph = updateAgentConfig(buildCanonicalFlow(), "dev", { prompt: "Outro prompt" });

        expect(isSameFlowGraph(buildCanonicalFlow(), graph)).toBe(false);
    });
});

function movePromptToTheEnd(node: FlowNode): FlowNode {
    if (node.type !== "agent") {
        return node;
    }

    const { prompt, ...otherFields } = node.config;
    return { ...node, config: { ...otherFields, prompt } };
}
