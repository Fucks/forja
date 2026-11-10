import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { buildLoopFlow, connect } from "@/test/factories/flow_graph_factory.js";
import { removeEdges } from "@/test/factories/flow_graph_variations.js";
import { checkConnection } from "@/web/canvas/connection_rules.js";

const ORIGIN = { x: 0, y: 0 };

describe("checkConnection", () => {
    it("accepts a text output connected to a text input", () => {
        const graph = buildGraph([buildAgent("writer"), buildAgent("reader")]);

        const verdict = checkConnection(
            graph,
            { nodeId: "writer", port: "summary" },
            { nodeId: "reader", port: "context" },
        );

        expect(verdict).toEqual({ ok: true });
    });

    it("rejects ports of incompatible types, naming both types", () => {
        const graph = buildGraph([buildAgent("writer"), buildListReader("reader")]);

        const verdict = checkConnection(
            graph,
            { nodeId: "writer", port: "summary" },
            { nodeId: "reader", port: "items" },
        );

        expect(verdict).toEqual({ ok: false, reason: "Tipos incompatíveis: text → workItemList" });
    });

    it("rejects a node connected to itself", () => {
        const graph = buildGraph([buildAgent("writer")]);

        const verdict = checkConnection(
            graph,
            { nodeId: "writer", port: "summary" },
            { nodeId: "writer", port: "context" },
        );

        expect(verdict).toEqual({ ok: false, reason: "Um nó não pode se ligar a si mesmo" });
    });

    it("rejects an output connected to another output", () => {
        const graph = buildGraph([buildAgent("writer"), buildAgent("reader")]);

        const verdict = checkConnection(
            graph,
            { nodeId: "writer", port: "summary" },
            { nodeId: "reader", port: "summary" },
        );

        expect(verdict).toEqual({ ok: false, reason: "Saída → saída não é permitido" });
    });

    it("rejects a port the node does not have", () => {
        const graph = buildGraph([buildAgent("writer"), buildAgent("reader")]);

        const verdict = checkConnection(
            graph,
            { nodeId: "writer", port: "summary" },
            { nodeId: "reader", port: "missing" },
        );

        expect(verdict).toEqual({ ok: false, reason: "A porta não existe" });
    });

    it("rejects a connection that closes a cycle outside a loop", () => {
        const graph = {
            ...buildGraph([buildAgent("writer"), buildAgent("reader")]),
            edges: [connect(["writer", "summary"], ["reader", "context"])],
        };

        const verdict = checkConnection(
            graph,
            { nodeId: "reader", port: "summary" },
            { nodeId: "writer", port: "context" },
        );

        expect(verdict).toEqual({ ok: false, reason: "Isto cria um ciclo fora de um loop" });
    });

    it("accepts a connection that closes a cycle inside a loop", () => {
        const loopFlow = buildLoopFlow();
        const backEdge = connect(["review", "summary"], ["dev", "notes"]);
        const graph = removeEdges(loopFlow, [backEdge.id]);

        const verdict = checkConnection(graph, backEdge.from, backEdge.to);

        expect(verdict).toEqual({ ok: true });
    });
});

function buildGraph(nodes: FlowNode[]): FlowGraph {
    return { schemaVersion: 1, nodes, edges: [], groups: [] };
}

function buildAgent(id: string): FlowNode {
    return createDefaultNode("agent", id, ORIGIN);
}

function buildListReader(id: string): FlowNode {
    return {
        ...createDefaultNode("script", id, ORIGIN),
        inputs: [{ name: "items", type: "workItemList", required: true }],
    };
}
