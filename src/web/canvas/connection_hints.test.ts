import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { hintPort } from "@/web/canvas/connection_hints.js";

const ORIGIN = { x: 0, y: 0 };
const GRAPH: FlowGraph = {
    schemaVersion: 2,
    nodes: [buildAgent("writer"), buildAgent("reader")],
    edges: [],
    groups: [],
};

describe("hintPort", () => {
    it("marks an input of a compatible type as compatible", () => {
        const hint = hintPort(
            GRAPH,
            { nodeId: "writer", port: "summary", type: "source" },
            { nodeId: "reader", port: "context", type: "target" },
        );

        expect(hint).toBe("compatible");
    });

    it("marks an input of another type as incompatible", () => {
        const hint = hintPort(
            GRAPH,
            { nodeId: "writer", port: "summary", type: "source" },
            { nodeId: "reader", port: "item", type: "target" },
        );

        expect(hint).toBe("incompatible");
    });

    it("checks a connection dragged out of an input from the output it reaches", () => {
        const hint = hintPort(
            GRAPH,
            { nodeId: "reader", port: "context", type: "target" },
            { nodeId: "writer", port: "summary", type: "source" },
        );

        expect(hint).toBe("compatible");
    });

    it("marks another output as incompatible", () => {
        const hint = hintPort(
            GRAPH,
            { nodeId: "writer", port: "summary", type: "source" },
            { nodeId: "reader", port: "summary", type: "source" },
        );

        expect(hint).toBe("incompatible");
    });

    it("gives no hint on the port the connection is dragged from", () => {
        const draggedPort = { nodeId: "writer", port: "summary", type: "source" } as const;

        const hint = hintPort(GRAPH, draggedPort, draggedPort);

        expect(hint).toBe("none");
    });
});

function buildAgent(id: string): FlowNode {
    return createDefaultNode("agent", id, ORIGIN);
}
