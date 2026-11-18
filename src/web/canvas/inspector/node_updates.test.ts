import { findNode } from "@/engine/graph_queries.js";
import type { FlowGraph, FlowNode, Port } from "@/shared/flow_graph.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import {
    addInputPort,
    removeInputPort,
    updateNodeConfig,
    withNodeConfig,
} from "@/web/canvas/inspector/node_updates.js";

const SPEC_PORT: Port = { name: "spec", type: "text", required: true };
const NOTES_PORT: Port = { name: "notes", type: "text", required: false };

describe("updateNodeConfig", () => {
    it("replaces the node with the updated one", () => {
        const graph = buildCanonicalFlow();

        const updated = updateNodeConfig(graph, "dev", (node) => ({ ...node, label: "Dev 2" }));

        expect(requireNode(updated, "dev").label).toBe("Dev 2");
    });

    it("leaves the other nodes untouched", () => {
        const graph = buildCanonicalFlow();

        const updated = updateNodeConfig(graph, "dev", (node) => ({ ...node, label: "Dev 2" }));

        expect(requireNode(updated, "tl")).toBe(requireNode(graph, "tl"));
    });

    it("drops the edges that reach an input the update removed", () => {
        const graph = buildCanonicalFlow();

        const updated = updateNodeConfig(graph, "dev", (node) => ({
            ...node,
            inputs: node.inputs.filter((port) => port.name !== "spec"),
        }));

        expect(listEdgesInto(updated, "dev")).toEqual([]);
    });

    it("drops the edges that leave an output the update removed", () => {
        const graph = buildCanonicalFlow();

        const updated = updateNodeConfig(graph, "dev", (node) => ({
            ...node,
            outputs: node.outputs.filter((port) => port.name !== "summary"),
        }));

        expect(listEdgesOutOf(updated, "dev", "summary")).toEqual([]);
    });

    it("keeps the edges of the outputs the update kept", () => {
        const graph = buildCanonicalFlow();

        const updated = updateNodeConfig(graph, "dev", (node) => ({ ...node, label: "Dev 2" }));

        expect(listEdgesOutOf(updated, "dev", "summary")).toEqual(
            listEdgesOutOf(graph, "dev", "summary"),
        );
    });

    it("returns the same graph when the node does not exist", () => {
        const graph = buildCanonicalFlow();

        const updated = updateNodeConfig(graph, "missing", (node) => ({ ...node, label: "X" }));

        expect(updated).toBe(graph);
    });
});

describe("addInputPort", () => {
    it("adds the port to the agent's inputs", () => {
        const graph = buildCanonicalFlow();

        const updated = addInputPort(graph, "tl", NOTES_PORT);

        expect(requireNode(updated, "tl").inputs).toContainEqual(NOTES_PORT);
    });

    it("keeps the graph unchanged when the agent already has an input with that name", () => {
        const graph = buildCanonicalFlow();

        const updated = addInputPort(graph, "dev", { ...SPEC_PORT, type: "json" });

        expect(updated).toBe(graph);
    });

    it("keeps the graph unchanged when the node is not an agent", () => {
        const graph = buildCanonicalFlow();

        const updated = addInputPort(graph, "open_pr", NOTES_PORT);

        expect(updated).toBe(graph);
    });
});

describe("removeInputPort", () => {
    it("removes the port from the node's inputs", () => {
        const graph = buildCanonicalFlow();

        const updated = removeInputPort(graph, "dev", "spec");

        expect(requireNode(updated, "dev").inputs.map((port) => port.name)).not.toContain("spec");
    });

    it("removes the edge connected to the port", () => {
        const graph = buildCanonicalFlow();

        const updated = removeInputPort(graph, "dev", "spec");

        expect(listEdgesInto(updated, "dev")).toEqual([]);
        expect(updated.edges).toHaveLength(graph.edges.length - 1);
    });
});

describe("withNodeConfig", () => {
    it("merges the changes into the config of a node of the given type", () => {
        const source = requireNode(buildCanonicalFlow(), "source");

        const updated = withNodeConfig(source, "source", { limit: 5 });

        expect(updated.config).toEqual({ ...source.config, limit: 5 });
    });

    it("leaves a node of another type unchanged", () => {
        const source = requireNode(buildCanonicalFlow(), "source");

        const updated = withNodeConfig(source, "script", { command: "npm test" });

        expect(updated).toBe(source);
    });
});

function requireNode(graph: FlowGraph, nodeId: string): FlowNode {
    const node = findNode(graph, nodeId);
    if (!node) {
        throw new Error(`Node ${nodeId} not found`);
    }

    return node;
}

function listEdgesOutOf(graph: FlowGraph, nodeId: string, port: string): FlowGraph["edges"] {
    return graph.edges.filter((edge) => edge.from.nodeId === nodeId && edge.from.port === port);
}

function listEdgesInto(graph: FlowGraph, nodeId: string): FlowGraph["edges"] {
    return graph.edges.filter((edge) => edge.to.nodeId === nodeId);
}
