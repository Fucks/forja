import standardFlowV1 from "@/test/fixtures/standard_flow_v1.json" with { type: "json" };
import { migrateFlowGraph } from "@/shared/migrate_flow_graph.js";

function buildGraphV1(parts: { nodes?: unknown[]; groups?: unknown[] }): Record<string, unknown> {
    return { schemaVersion: 1, nodes: parts.nodes ?? [], edges: [], groups: parts.groups ?? [] };
}

function conditionNode(condition: unknown): Record<string, unknown> {
    return { id: "decide", type: "condition", label: "Decidir", config: { condition } };
}

function loopGroup(until: unknown): Record<string, unknown> {
    return { id: "loop", kind: "loop", label: "Loop", config: { maxIterations: 3, until } };
}

function gitNode(config: Record<string, unknown>): Record<string, unknown> {
    return {
        id: "open_pr",
        type: "git",
        label: "Abrir PR",
        config: { action: "open_pr", ...config },
    };
}

function indexOfId(elements: { id: string }[], id: string): number {
    return elements.findIndex((element) => element.id === id);
}

describe("migrateFlowGraph", () => {
    it("moves a v1 graph to schemaVersion 2", () => {
        const migrated = migrateFlowGraph(buildGraphV1({}));

        expect(migrated).toEqual({ schemaVersion: 2, nodes: [], edges: [], groups: [] });
    });

    it("reads the paths of a condition from the value it receives", () => {
        const graph = buildGraphV1({
            nodes: [conditionNode({ op: "eq", path: "approved", value: true })],
        });

        const migrated = migrateFlowGraph(graph);

        expect(migrated).toMatchObject({
            nodes: [{ config: { condition: { op: "eq", path: "inputs.value.approved" } } }],
        });
    });

    it("rewrites every comparison nested in and, or and not", () => {
        const graph = buildGraphV1({
            nodes: [
                conditionNode({
                    op: "and",
                    conditions: [
                        { op: "exists", path: "approved" },
                        {
                            op: "or",
                            conditions: [
                                { op: "gt", path: "score", value: 7 },
                                {
                                    op: "not",
                                    condition: { op: "eq", path: "blocked", value: true },
                                },
                            ],
                        },
                    ],
                }),
            ],
        });

        const migrated = migrateFlowGraph(graph);

        expect(migrated).toMatchObject({
            nodes: [
                {
                    config: {
                        condition: {
                            op: "and",
                            conditions: [
                                { op: "exists", path: "inputs.value.approved" },
                                {
                                    op: "or",
                                    conditions: [
                                        { op: "gt", path: "inputs.value.score", value: 7 },
                                        {
                                            op: "not",
                                            condition: { path: "inputs.value.blocked" },
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
            ],
        });
    });

    it("reads the paths of a loop's until from the nodes of the loop", () => {
        const graph = buildGraphV1({
            groups: [loopGroup({ op: "eq", path: "reviewer.result.approved", value: true })],
        });

        const migrated = migrateFlowGraph(graph);

        expect(migrated).toMatchObject({
            groups: [{ config: { until: { path: "nodes.reviewer.result.approved" } } }],
        });
    });

    it("reads the body of a pull request from the inputs of the git node", () => {
        const graph = buildGraphV1({ nodes: [gitNode({ bodyFrom: "summary" })] });

        const migrated = migrateFlowGraph(graph);

        expect(migrated).toMatchObject({ nodes: [{ config: { bodyFrom: "inputs.summary" } }] });
    });

    it("leaves a git node without bodyFrom as it is", () => {
        const graph = buildGraphV1({ nodes: [gitNode({})] });

        const migrated = migrateFlowGraph(graph);

        expect(migrated).toHaveProperty(["nodes", 0, "config", "action"], "open_pr");
        expect(migrated).not.toHaveProperty(["nodes", 0, "config", "bodyFrom"]);
    });

    it("keeps a blank path blank, so validation still reports the unfinished rule", () => {
        const graph = buildGraphV1({ groups: [loopGroup({ op: "exists", path: "" })] });

        const migrated = migrateFlowGraph(graph);

        expect(migrated).toMatchObject({ groups: [{ config: { until: { path: "" } } }] });
    });

    it("returns a v2 graph unchanged", () => {
        const graphV2 = {
            ...buildGraphV1({
                nodes: [
                    conditionNode({ op: "eq", path: "nodes.reviewer.result.approved", value: 1 }),
                ],
            }),
            schemaVersion: 2,
        };

        expect(migrateFlowGraph(graphV2)).toEqual(graphV2);
    });

    it("returns input that is not a graph unchanged", () => {
        expect(migrateFlowGraph("texto")).toBe("texto");
        expect(migrateFlowGraph(null)).toBeNull();
        expect(migrateFlowGraph({ schemaVersion: 1 })).toEqual({ schemaVersion: 1 });
    });

    it("does not change the graph it receives", () => {
        const graph = buildGraphV1({ nodes: [gitNode({ bodyFrom: "summary" })] });
        const original = structuredClone(graph);

        migrateFlowGraph(graph);

        expect(graph).toEqual(original);
    });

    it("gives the same graph when migrating twice", () => {
        const migratedOnce = migrateFlowGraph(standardFlowV1);

        expect(migrateFlowGraph(migratedOnce)).toEqual(migratedOnce);
    });

    it("migrates the standard flow without losing nodes, edges or groups", () => {
        const migrated = migrateFlowGraph(standardFlowV1);

        expect(migrated).toMatchObject({
            schemaVersion: 2,
            nodes: standardFlowV1.nodes.map((node) => ({ id: node.id, label: node.label })),
            edges: standardFlowV1.edges,
            groups: standardFlowV1.groups.map((group) => ({ id: group.id, kind: group.kind })),
        });
        expect(migrated).toHaveProperty(
            ["nodes", indexOfId(standardFlowV1.nodes, "open_pr"), "config", "bodyFrom"],
            "inputs.summary",
        );
        expect(migrated).toHaveProperty(
            ["groups", indexOfId(standardFlowV1.groups, "review_loop"), "config", "until", "path"],
            "nodes.revisar.result.approved",
        );
    });
});
