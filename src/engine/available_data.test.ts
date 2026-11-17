import { describeAvailableData } from "@/engine/available_data.js";
import type { AvailableDataOptions, DataField } from "@/engine/available_data.js";
import type { FlowGraph, FlowNode, NodeType, Port } from "@/shared/flow_graph.js";
import type { JsonSchema } from "@/shared/json_schema.js";
import {
    buildCanonicalFlow,
    connect,
    createNodeOfType,
} from "@/test/factories/flow_graph_factory.js";

const ORIGIN = { x: 0, y: 0 };
const PORT_LABELS: Record<string, string> = { result: "Resultado", summary: "Resumo" };
const NODE_SCOPE: AvailableDataOptions = { scope: "node", portLabels: labelPortForTest };

function labelPortForTest(_nodeType: NodeType, port: Port): string {
    return PORT_LABELS[port.name] ?? port.name;
}

describe("describeAvailableData of upstream nodes", () => {
    it("lists the agent result fields from its outputSchema, with labels and types", () => {
        const graph = withDecisionAfter(buildCanonicalFlow(), "reviewer");

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        expect(fields).toContainEqual({
            path: "nodes.reviewer.result.approved",
            label: "Reviewer › Resultado › approved",
            type: "boolean",
            sourceNodeId: "reviewer",
            depth: 1,
        });
        expect(findField(fields, "nodes.reviewer.result.notes")).toMatchObject({
            label: "Reviewer › Resultado › notes",
            type: "string",
        });
    });

    it("lists the port itself before its fields", () => {
        const graph = withDecisionAfter(buildCanonicalFlow(), "reviewer");

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        expect(findField(fields, "nodes.reviewer.result")).toMatchObject({
            label: "Reviewer › Resultado",
            type: "object",
            depth: 0,
        });
        expect(findField(fields, "nodes.reviewer.summary")).toMatchObject({ type: "string" });
    });

    it("lists the nearest upstream nodes first", () => {
        const graph = withDecisionAfter(buildCanonicalFlow(), "reviewer");

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        expect(listSourceNodeIds(fields)).toEqual([
            "reviewer",
            "dev",
            "tl",
            "source",
            "trigger",
        ]);
    });

    it("never lists the node itself nor the nodes after it", () => {
        const graph = buildCanonicalFlow();

        const fields = describeAvailableData(graph, "dev", NODE_SCOPE);

        expect(listSourceNodeIds(fields)).not.toContain("dev");
        expect(listSourceNodeIds(fields)).not.toContain("reviewer");
        expect(listSourceNodeIds(fields)).not.toContain("open_pr");
    });

    it("goes down nested properties, keeping each description", () => {
        const graph = withAgentSchema({
            type: "object",
            properties: {
                review: {
                    type: "object",
                    description: "A revisão",
                    properties: { score: { type: "integer", description: "Nota de 0 a 10" } },
                },
            },
        });

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        expect(findField(fields, "nodes.reviewer.result.review")).toMatchObject({
            type: "object",
            description: "A revisão",
            depth: 1,
        });
        expect(findField(fields, "nodes.reviewer.result.review.score")).toMatchObject({
            label: "Reviewer › Resultado › review › score",
            type: "number",
            description: "Nota de 0 a 10",
            depth: 2,
        });
    });

    it("gives a field with an enum its enum values", () => {
        const graph = withAgentSchema({
            type: "object",
            properties: { kind: { type: "string", enum: ["bug", "feature"] } },
        });

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        expect(findField(fields, "nodes.reviewer.result.kind")).toMatchObject({
            type: "string",
            enumValues: ["bug", "feature"],
        });
    });

    it("maps lists to list and unknown schema types to any", () => {
        const graph = withAgentSchema({
            type: "object",
            properties: { files: { type: "array" }, anything: {} },
        });

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        expect(findField(fields, "nodes.reviewer.result.files")?.type).toBe("list");
        expect(findField(fields, "nodes.reviewer.result.anything")?.type).toBe("any");
    });
});

function withDecisionAfter(graph: FlowGraph, nodeId: string): FlowGraph {
    const decision: FlowNode = {
        ...createNodeOfType("condition", "decision", ORIGIN),
        parentGroupId: "review_and_open_pr",
    };

    return {
        ...graph,
        nodes: [...graph.nodes, decision],
        edges: [...graph.edges, connect([nodeId, "result"], ["decision", "value"])],
    };
}

function withAgentSchema(outputSchema: JsonSchema): FlowGraph {
    const graph = withDecisionAfter(buildCanonicalFlow(), "reviewer");

    return {
        ...graph,
        nodes: graph.nodes.map((node) =>
            node.type === "agent" && node.id === "reviewer"
                ? { ...node, config: { ...node.config, outputSchema } }
                : node,
        ),
    };
}

function findField(fields: DataField[], path: string): DataField | undefined {
    return fields.find((field) => field.path === path);
}

function listSourceNodeIds(fields: DataField[]): string[] {
    const nodeFields = fields.filter((field) => field.path.startsWith("nodes."));

    return [...new Set(nodeFields.flatMap((field) => field.sourceNodeId ?? []))];
}
