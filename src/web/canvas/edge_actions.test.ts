import type { FlowGraph } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { connect as buildEdge } from "@/test/factories/flow_graph_factory.js";
import { connect, removeEdges, removeNodes } from "@/web/canvas/edge_actions.js";

const ORIGIN = { x: 0, y: 0 };

describe("connect", () => {
    it("adds an edge from the output to the input with the new id", () => {
        const graph = buildAgents(["writer", "reader"]);

        const connected = connect(
            graph,
            { nodeId: "writer", port: "summary" },
            { nodeId: "reader", port: "context" },
            () => "edg_new",
        );

        expect(connected.edges).toEqual([
            {
                id: "edg_new",
                from: { nodeId: "writer", port: "summary" },
                to: { nodeId: "reader", port: "context" },
            },
        ]);
    });

    it("replaces the edge already connected to the input", () => {
        const earlierEdge = buildEdge(["writer", "summary"], ["reader", "context"]);
        const graph = { ...buildAgents(["writer", "editor", "reader"]), edges: [earlierEdge] };

        const connected = connect(
            graph,
            { nodeId: "editor", port: "summary" },
            { nodeId: "reader", port: "context" },
            () => "edg_new",
        );

        expect(connected.edges.map((edge) => edge.id)).toEqual(["edg_new"]);
    });

    it("keeps the edges connected to the other inputs", () => {
        const itemEdge = buildEdge(["source", "items"], ["reader", "item"]);
        const graph = { ...buildAgents(["writer", "reader"]), edges: [itemEdge] };

        const connected = connect(
            graph,
            { nodeId: "writer", port: "summary" },
            { nodeId: "reader", port: "context" },
            () => "edg_new",
        );

        expect(connected.edges.map((edge) => edge.id)).toEqual([itemEdge.id, "edg_new"]);
    });
});

describe("removeEdges", () => {
    it("removes only the given edges", () => {
        const removedEdge = buildEdge(["writer", "summary"], ["reader", "context"]);
        const keptEdge = buildEdge(["writer", "result"], ["reader", "item"]);
        const graph = { ...buildAgents(["writer", "reader"]), edges: [removedEdge, keptEdge] };

        const remaining = removeEdges(graph, [removedEdge.id]);

        expect(remaining.edges).toEqual([keptEdge]);
    });
});

describe("removeNodes", () => {
    it("removes the nodes together with every edge connected to them", () => {
        const incomingEdge = buildEdge(["writer", "summary"], ["editor", "context"]);
        const outgoingEdge = buildEdge(["editor", "summary"], ["reader", "context"]);
        const unrelatedEdge = buildEdge(["writer", "result"], ["reader", "item"]);
        const graph = {
            ...buildAgents(["writer", "editor", "reader"]),
            edges: [incomingEdge, outgoingEdge, unrelatedEdge],
        };

        const remaining = removeNodes(graph, ["editor"]);

        expect(remaining.nodes.map((node) => node.id)).toEqual(["writer", "reader"]);
        expect(remaining.edges).toEqual([unrelatedEdge]);
    });
});

function buildAgents(ids: string[]): FlowGraph {
    return {
        schemaVersion: 1,
        nodes: ids.map((id) => createDefaultNode("agent", id, ORIGIN)),
        edges: [],
        groups: [],
    };
}
