import {
    FlowGraphParseError,
    flowGroupSchema,
    type LoopConfig,
    type MapConfig,
    parseFlowGraph,
} from "@/shared/flow_graph.js";
import { buildCanonicalFlow, buildLoopFlow } from "@/test/factories/flow_graph_factory.js";

describe("parseFlowGraph", () => {
    it("accepts the canonical flow unchanged", () => {
        const canonicalFlow = buildCanonicalFlow();

        expect(parseFlowGraph(canonicalFlow)).toEqual(canonicalFlow);
    });

    it("accepts the loop flow unchanged", () => {
        const loopFlow = buildLoopFlow();

        expect(parseFlowGraph(loopFlow)).toEqual(loopFlow);
    });

    it("accepts a graph with a single trigger and fills port defaults", () => {
        const graph = parseFlowGraph(buildSingleTriggerGraph());

        expect(graph.nodes[0]?.outputs).toEqual([
            { name: "items", type: "workItemList", required: true },
        ]);
    });

    it("rejects a node of unknown type with the path of the error", () => {
        const graph = buildSingleTriggerGraph();
        const graphWithUnknownNode = {
            ...graph,
            nodes: [graph.nodes[0], { ...graph.nodes[0], id: "n2", type: "teleport" }],
        };

        const parse = () => parseFlowGraph(graphWithUnknownNode);

        expect(parse).toThrow(FlowGraphParseError);
        expect(parse).toThrow(/nodes\.1\.type/);
    });

    it("lists every invalid field in the error", () => {
        const graph = buildSingleTriggerGraph();
        const graphWithTwoErrors = { ...graph, schemaVersion: 2, edges: [{ id: "e1" }] };

        const error = captureParseError(() => parseFlowGraph(graphWithTwoErrors));

        expect(error.issues.map((issue) => issue.path)).toEqual(
            expect.arrayContaining(["schemaVersion", "edges.0.from", "edges.0.to"]),
        );
    });

    it("rejects a port name that is not an identifier", () => {
        const graph = buildSingleTriggerGraph();
        const triggerWithBadPort = {
            ...graph.nodes[0],
            outputs: [{ name: "Work Items", type: "workItemList" }],
        };

        const parse = () => parseFlowGraph({ ...graph, nodes: [triggerWithBadPort] });

        expect(parse).toThrow(/nodes\.0\.outputs\.0\.name/);
    });

    it("rejects a config that does not belong to the node type", () => {
        const graph = buildSingleTriggerGraph();
        const triggerWithAgentConfig = { ...graph.nodes[0], config: { prompt: "Olá" } };

        const parse = () => parseFlowGraph({ ...graph, nodes: [triggerWithAgentConfig] });

        expect(parse).toThrow(/nodes\.0\.config\.kind/);
    });
});

describe("buildCanonicalFlow", () => {
    it("chains three maps with concurrency 1, 3 and 1", () => {
        const { groups } = buildCanonicalFlow();

        expect(groups.map((group) => [group.id, group.kind, group.config])).toEqual([
            ["specify", "map", { concurrency: 1, barrier: false, failFast: false }],
            ["develop", "map", { concurrency: 3, barrier: false, failFast: false }],
            ["review_and_open_pr", "map", { concurrency: 1, barrier: false, failFast: false }],
        ]);
    });

    it("places each node in its stage of the PRD flow", () => {
        const { nodes } = buildCanonicalFlow();

        expect(nodes.map((node) => [node.id, node.type, node.parentGroupId])).toEqual([
            ["trigger", "trigger", undefined],
            ["source", "source", undefined],
            ["tl", "agent", "specify"],
            ["dev", "agent", "develop"],
            ["reviewer", "agent", "review_and_open_pr"],
            ["open_pr", "git", "review_and_open_pr"],
            ["output", "output", "review_and_open_pr"],
        ]);
    });

    it("feeds the TL summary into the Dev spec port across maps", () => {
        const { edges } = buildCanonicalFlow();

        expect(edges).toContainEqual(
            expect.objectContaining({
                from: { nodeId: "tl", port: "summary" },
                to: { nodeId: "dev", port: "spec" },
            }),
        );
    });
});

describe("buildLoopFlow", () => {
    it("nests a review loop with a test script inside a map", () => {
        const { nodes, groups } = buildLoopFlow();

        expect(groups.map((group) => [group.id, group.kind, group.parentGroupId])).toEqual([
            ["items", "map", undefined],
            ["review_loop", "loop", "items"],
        ]);
        expect(
            nodes.filter((node) => node.parentGroupId === "review_loop").map((node) => node.id),
        ).toEqual(["dev", "tests", "review"]);
    });

    it("sends the review back to the developer until it is approved", () => {
        const { edges, groups } = buildLoopFlow();

        expect(edges).toContainEqual(
            expect.objectContaining({
                from: { nodeId: "review", port: "summary" },
                to: { nodeId: "dev", port: "notes" },
            }),
        );
        expect(groups[1]?.config).toEqual({
            maxIterations: 3,
            until: { op: "eq", path: "review.approved", value: true },
            carry: ["notes"],
        });
    });
});

describe("flowGroupSchema", () => {
    it("fills the map defaults", () => {
        const group = flowGroupSchema.parse(buildMapGroup({}));

        expect(group.config).toEqual({ concurrency: 1, barrier: false, failFast: false });
    });

    it.each([1, 16])("accepts a map concurrency of %i", (concurrency) => {
        const result = flowGroupSchema.safeParse(buildMapGroup({ concurrency }));

        expect(result.success).toBe(true);
    });

    it.each([0, 17])("rejects a map concurrency of %i", (concurrency) => {
        const result = flowGroupSchema.safeParse(buildMapGroup({ concurrency }));

        expect(result.success).toBe(false);
    });

    it.each([1, 50])("accepts a loop with maxIterations %i", (maxIterations) => {
        const result = flowGroupSchema.safeParse(buildLoopGroup({ maxIterations }));

        expect(result.success).toBe(true);
    });

    it.each([0, 51])("rejects a loop with maxIterations %i", (maxIterations) => {
        const result = flowGroupSchema.safeParse(buildLoopGroup({ maxIterations }));

        expect(result.success).toBe(false);
    });

    it("rejects a loop without an until condition", () => {
        const loopGroup = buildLoopGroup({});
        const loopWithoutUntil = { ...loopGroup, config: { maxIterations: 3 } };

        const result = flowGroupSchema.safeParse(loopWithoutUntil);

        expect(result.success).toBe(false);
    });
});

function buildSingleTriggerGraph() {
    return {
        schemaVersion: 1,
        nodes: [
            {
                id: "n1",
                type: "trigger",
                label: "Gatilho",
                position: { x: 0, y: 0 },
                inputs: [],
                outputs: [{ name: "items", type: "workItemList" }],
                config: { kind: "manual" },
            },
        ],
        edges: [],
        groups: [],
    };
}

function buildMapGroup(config: Partial<MapConfig>) {
    return {
        id: "g1",
        kind: "map",
        label: "Desenvolver",
        position: { x: 0, y: 0 },
        size: { width: 400, height: 200 },
        config,
    };
}

function buildLoopGroup(config: Partial<LoopConfig>) {
    return {
        id: "g2",
        kind: "loop",
        label: "Revisar até aprovar",
        position: { x: 0, y: 0 },
        size: { width: 400, height: 200 },
        config: { until: { op: "eq", path: "review.approved", value: true }, ...config },
    };
}

function captureParseError(parse: () => unknown): FlowGraphParseError {
    try {
        parse();
    } catch (error) {
        if (error instanceof FlowGraphParseError) {
            return error;
        }
        throw error;
    }
    throw new Error("Expected a FlowGraphParseError");
}
