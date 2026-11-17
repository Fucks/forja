import { describeAvailableData } from "@/engine/available_data.js";
import type { AvailableDataOptions, DataField } from "@/engine/available_data.js";
import type { FlowGraph, FlowNode, NodeType, Port } from "@/shared/flow_graph.js";
import type { JsonSchema } from "@/shared/json_schema.js";
import {
    buildCanonicalFlow,
    buildLoopFlow,
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

        expect(listSourceNodeIds(fields)).toEqual(["reviewer", "dev", "tl", "source", "trigger"]);
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

describe("describeAvailableData of deterministic and untyped outputs", () => {
    it("uses the fixed shape of a git result", () => {
        const graph = withDecisionAfter(buildCanonicalFlow(), "open_pr");

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        expect(findField(fields, "nodes.abrir_pr.result.prUrl")?.type).toBe("string");
        expect(findField(fields, "nodes.abrir_pr.result.pushed")?.type).toBe("boolean");
    });

    it("uses the fixed shape of a script result", () => {
        const fields = describeAvailableData(buildLoopFlow(), "review", NODE_SCOPE);

        expect(findField(fields, "nodes.testes.result.exitCode")?.type).toBe("number");
        expect(findField(fields, "nodes.testes.result.stdoutTail")?.type).toBe("string");
    });

    it("lists the items of a source as a list", () => {
        const fields = describeAvailableData(buildCanonicalFlow(), "tl", NODE_SCOPE);

        expect(findField(fields, "nodes.fonte.items")?.type).toBe("list");
    });

    it("lists a text port as a string", () => {
        const fields = describeAvailableData(buildCanonicalFlow(), "reviewer", NODE_SCOPE);

        expect(findField(fields, "nodes.dev.summary")?.type).toBe("string");
    });

    it("lists a json port without schema as an object without fields", () => {
        const fields = describeAvailableData(buildCanonicalFlow(), "reviewer", NODE_SCOPE);

        expect(findField(fields, "nodes.dev.result")?.type).toBe("object");
        expect(fields.filter((field) => field.path.startsWith("nodes.dev.result."))).toEqual([]);
    });

    it("uses the schema declared on the port", () => {
        const graph = withDecisionAfter(buildCanonicalFlow(), "reviewer");
        const portSchema = { type: "object", properties: { score: { type: "number" } } };

        const fields = describeAvailableData(
            withNodeOutputs(graph, "dev", [
                { name: "metrics", type: "json", required: true, schema: portSchema },
            ]),
            "decision",
            NODE_SCOPE,
        );

        expect(findField(fields, "nodes.dev.metrics.score")?.type).toBe("number");
    });

    it("goes down at most four levels of properties", () => {
        const graph = withAgentSchema(nestedObjectSchema(["a", "b", "c", "d", "e"]));

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        expect(findField(fields, "nodes.reviewer.result.a.b.c.d")).toBeDefined();
        expect(findField(fields, "nodes.reviewer.result.a.b.c.d.e")).toBeUndefined();
    });
});

describe("describeAvailableData of the node inputs", () => {
    it("lists each input with the shape of the output connected to it", () => {
        const graph = withDecisionAfter(buildCanonicalFlow(), "reviewer");

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        expect(findField(fields, "inputs.value")).toMatchObject({
            label: "Entradas deste nó › value",
            type: "object",
            sourceNodeId: "reviewer",
            depth: 0,
        });
        expect(findField(fields, "inputs.value.approved")).toMatchObject({
            label: "Entradas deste nó › value › approved",
            type: "boolean",
            depth: 1,
        });
    });

    it("lists an unconnected input with the type of its own port", () => {
        const fields = describeAvailableData(buildCanonicalFlow(), "dev", NODE_SCOPE);

        expect(findField(fields, "inputs.context")).toMatchObject({ type: "string", depth: 0 });
        expect(findField(fields, "inputs.context")?.sourceNodeId).toBeUndefined();
    });
});

describe("describeAvailableData of the item, the project and the run", () => {
    it("lists the fields of the current item inside a Map", () => {
        const graph = withDecisionAfter(buildCanonicalFlow(), "reviewer");

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        expect(findField(fields, "item.title")).toMatchObject({
            label: "Item atual › title",
            type: "string",
            depth: 0,
        });
        expect(findField(fields, "item.number")?.type).toBe("number");
        expect(findField(fields, "item.labels")?.type).toBe("list");
    });

    it("lists no item fields outside a Map", () => {
        const fields = describeAvailableData(buildCanonicalFlow(), "source", NODE_SCOPE);

        expect(fields.filter((field) => field.path.startsWith("item."))).toEqual([]);
    });

    it("lists the project and the run after everything else", () => {
        const fields = describeAvailableData(buildCanonicalFlow(), "source", NODE_SCOPE);

        expect(fields.slice(-4).map((field) => field.path)).toEqual([
            "project.baseBranch",
            "project.name",
            "run.iteration",
            "run.attempt",
        ]);
    });

    it("lists the item first, then the inputs, then the upstream nodes", () => {
        const graph = withDecisionAfter(buildCanonicalFlow(), "reviewer");

        const fields = describeAvailableData(graph, "decision", NODE_SCOPE);

        const roots = [...new Set(fields.map((field) => field.path.split(".")[0]))];
        expect(roots).toEqual(["item", "inputs", "nodes", "project", "run"]);
    });
});

describe("describeAvailableData of a loop until", () => {
    it("lists only the outputs of the nodes inside the loop", () => {
        const fields = describeAvailableData(buildLoopFlow(), "review_loop", {
            scope: "loopUntil",
            groupId: "review_loop",
            portLabels: labelPortForTest,
        });

        expect(fields.every((field) => field.path.startsWith("nodes."))).toBe(true);
        expect(listSourceNodeIds(fields)).toEqual(["dev", "tests", "review"]);
        expect(findField(fields, "nodes.revisar.result.approved")?.type).toBe("boolean");
    });

    it("lists nothing without a group", () => {
        const fields = describeAvailableData(buildLoopFlow(), "review_loop", {
            scope: "loopUntil",
            portLabels: labelPortForTest,
        });

        expect(fields).toEqual([]);
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

function withNodeOutputs(graph: FlowGraph, nodeId: string, outputs: Port[]): FlowGraph {
    return {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, outputs } : node)),
    };
}

function nestedObjectSchema(propertyNames: string[]): JsonSchema {
    return propertyNames.reduceRight<JsonSchema>(
        (inner, name) => ({ type: "object", properties: { [name]: inner } }),
        { type: "string" },
    );
}
