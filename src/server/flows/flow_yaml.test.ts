import { DomainValidationError } from "@/server/errors.js";
import {
    FlowFileError,
    flowFileName,
    flowToYaml,
    normalizeFlowGraph,
    yamlToFlow,
} from "@/server/flows/flow_yaml.js";
import type { FlowFile } from "@/server/flows/flow_yaml.js";
import type { FlowGraph, Position } from "@/shared/flow_graph.js";
import { buildCanonicalFlow, buildLoopFlow } from "@/test/factories/flow_graph_factory.js";

const EXPORTED_AT = "2026-11-08T12:00:00.000Z";

function buildFlowFile(graph: FlowGraph): FlowFile {
    return { forja: 1, name: "Entrega", exportedAt: EXPORTED_AT, graph };
}

function catchFlowFileError(text: string): FlowFileError {
    try {
        yamlToFlow(text);
    } catch (error) {
        if (error instanceof FlowFileError) {
            return error;
        }
        throw error;
    }
    throw new Error("yamlToFlow accepted the text");
}

describe("flowToYaml and yamlToFlow", () => {
    it.each([
        ["canonical", buildCanonicalFlow()],
        ["loop", buildLoopFlow()],
    ])("reproduce the normalized %s flow after a round trip", (_name, graph) => {
        const file = buildFlowFile(graph);

        const roundTrip = yamlToFlow(flowToYaml(file));

        expect(roundTrip).toEqual({ ...file, graph: normalizeFlowGraph(graph) });
    });

    it("keeps every node, group and edge of the original graph", () => {
        const graph = buildLoopFlow();

        const roundTrip = yamlToFlow(flowToYaml(buildFlowFile(graph)));

        expect(roundTrip.graph.nodes).toHaveLength(graph.nodes.length);
        expect(roundTrip.graph.groups).toHaveLength(graph.groups.length);
        expect(roundTrip.graph.edges).toHaveLength(graph.edges.length);
    });
});

describe("flowToYaml", () => {
    it("writes the same text for the same graph in a different order", () => {
        const graph = buildCanonicalFlow();
        const shuffled: FlowGraph = {
            ...graph,
            nodes: [...graph.nodes].reverse(),
            groups: [...graph.groups].reverse(),
            edges: [...graph.edges].reverse(),
        };

        const original = flowToYaml(buildFlowFile(graph));
        const reordered = flowToYaml(buildFlowFile(shuffled));

        expect(reordered).toBe(original);
    });

    it("writes the header first and the graph sections in a fixed order", () => {
        const yaml = flowToYaml(buildFlowFile(buildCanonicalFlow()));

        const topLevelKeys = yaml.match(/^\w+(?=:)/gm);
        const graphKeys = yaml.match(/^ {2}\w+(?=:)/gm)?.map((key) => key.trim());

        expect(topLevelKeys).toEqual(["forja", "name", "exportedAt", "graph"]);
        expect(graphKeys).toEqual(["schemaVersion", "nodes", "groups", "edges"]);
    });

    it("writes the fields of each node in a fixed order", () => {
        const yaml = flowToYaml(buildFlowFile(buildCanonicalFlow()));

        const developerNode = yaml.slice(
            yaml.indexOf("    - id: dev"),
            yaml.indexOf("    - id: open_pr"),
        );
        const nodeKeys = developerNode
            .match(/^ {4}- \w+(?=:)|^ {6}\w+(?=:)/gm)
            ?.map(stripListMarker);

        expect(nodeKeys).toEqual([
            "id",
            "type",
            "label",
            "parentGroupId",
            "position",
            "inputs",
            "outputs",
            "config",
        ]);
    });

    it("rounds positions to whole numbers", () => {
        const graph = moveNode(buildCanonicalFlow(), "trigger", { x: 10.4, y: 20.6 });

        const yaml = flowToYaml(buildFlowFile(graph));

        expect(yamlToFlow(yaml).graph.nodes).toContainEqual(
            expect.objectContaining({ id: "trigger", position: { x: 10, y: 21 } }),
        );
    });

    it("writes multiline prompts as literal blocks", () => {
        const yaml = flowToYaml(buildFlowFile(buildCanonicalFlow()));

        expect(yaml).toContain(
            [
                "        prompt: |-",
                "          Implemente a issue #{{item.number}} seguindo a especificação:",
                "          {{inputs.spec}}",
            ].join("\n"),
        );
    });
});

describe("yamlToFlow", () => {
    it("rejects a file of an unknown forja version", () => {
        const yaml = flowToYaml(buildFlowFile(buildCanonicalFlow())).replace(
            "forja: 1",
            "forja: 2",
        );

        const error = catchFlowFileError(yaml);

        expect(error.message).toContain("forja: 2");
        expect(error.issues).toEqual([
            { kind: "content", path: "forja", message: expect.any(String) as unknown },
        ]);
    });

    it("rejects text that is not a flow file", () => {
        const error = catchFlowFileError("apenas um texto");

        expect(error.issues).toEqual([
            { kind: "content", path: "forja", message: expect.any(String) as unknown },
        ]);
    });

    it("reports the line and column of broken YAML", () => {
        const error = catchFlowFileError("forja: 1\nname: [Entrega\ngraph: {}\n");

        expect(error.message).toContain("linha 3, coluna 1");
        expect(error.issues).toEqual([
            { kind: "syntax", line: 3, column: 1, message: expect.any(String) as unknown },
        ]);
    });

    it("reports the path of every invalid field of the graph", () => {
        const yaml = flowToYaml(buildFlowFile(buildCanonicalFlow())).replace(
            "schemaVersion: 1",
            "schemaVersion: 7",
        );

        const error = catchFlowFileError(yaml);

        expect(error.issues).toEqual([
            {
                kind: "content",
                path: "graph.schemaVersion",
                message: expect.any(String) as unknown,
            },
        ]);
    });

    it("is a validation error so the API answers 422", () => {
        const error = catchFlowFileError("forja: [");

        expect(error).toBeInstanceOf(DomainValidationError);
    });
});

describe("flowFileName", () => {
    it("names the file after the slug of the flow", () => {
        expect(flowFileName("Entrega Contínua")).toBe("entrega_continua.forja.yaml");
    });

    it("drops characters that are unsafe in a file name", () => {
        expect(flowFileName('Revisão / "PR" 2')).toBe("revisao__pr_2.forja.yaml");
    });
});

function moveNode(graph: FlowGraph, nodeId: string, position: Position): FlowGraph {
    const nodes = graph.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node));

    return { ...graph, nodes };
}

function stripListMarker(key: string): string {
    return key.replace("- ", "").trim();
}
