import { findNode } from "@/engine/graph_queries.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import {
    buildCanonicalFlow,
    connect,
    createNodeOfType,
} from "@/test/factories/flow_graph_factory.js";
import { listInputSources } from "@/web/canvas/inspector/node_input_sources.js";

const GRAPH = buildCanonicalFlow();

describe("listInputSources", () => {
    it("names the node and the documented output connected to each input", () => {
        const sources = listInputSources(GRAPH, requireNode(GRAPH, "reviewer"));

        expect(sources).toContainEqual({
            portName: "context",
            source: {
                status: "connected",
                origins: [{ nodeLabel: "Dev", portLabel: "Resumo em texto" }],
            },
        });
    });

    it("tells that an unconnected item inside a Map arrives by itself", () => {
        const sources = listInputSources(GRAPH, requireNode(GRAPH, "reviewer"));

        expect(sources).toContainEqual({ portName: "item", source: { status: "automatic" } });
    });

    it("tells that an unconnected item outside a Map is not connected", () => {
        const agent = createNodeOfType("agent", "lonely", { x: 0, y: 0 });
        const graph = { ...GRAPH, nodes: [...GRAPH.nodes, agent] };

        const sources = listInputSources(graph, agent);

        expect(sources).toContainEqual({ portName: "item", source: { status: "unconnected" } });
    });

    it("tells that an unconnected text input is not connected, even inside a Map", () => {
        const reviewer = requireNode(GRAPH, "reviewer");
        const graph = {
            ...GRAPH,
            edges: GRAPH.edges.filter((edge) => edge.to.nodeId !== reviewer.id),
        };

        const sources = listInputSources(graph, reviewer);

        expect(sources).toContainEqual({ portName: "context", source: { status: "unconnected" } });
    });

    it("falls back to the port name when the output has no documentation", () => {
        const script = createNodeOfType("script", "report", { x: 0, y: 0 });
        const reportScript = {
            ...script,
            outputs: [{ name: "report", type: "text" as const, required: true }],
        };
        const reader = createNodeOfType("agent", "reader", { x: 0, y: 0 });
        const graph = {
            ...GRAPH,
            nodes: [...GRAPH.nodes, reportScript, reader],
            edges: [...GRAPH.edges, connect(["report", "report"], ["reader", "context"])],
        };

        const sources = listInputSources(graph, reader);

        expect(sources).toContainEqual({
            portName: "context",
            source: {
                status: "connected",
                origins: [{ nodeLabel: script.label, portLabel: "report" }],
            },
        });
    });
});

function requireNode(graph: FlowGraph, nodeId: string): FlowNode {
    const node = findNode(graph, nodeId);
    if (!node) {
        throw new Error(`Node ${nodeId} not found`);
    }

    return node;
}
