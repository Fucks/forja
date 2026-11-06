import {
    FlowGraphParseError,
    flowGroupSchema,
    type LoopConfig,
    type MapConfig,
    parseFlowGraph,
} from "@/shared/flow_graph.js";

describe("parseFlowGraph", () => {
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
