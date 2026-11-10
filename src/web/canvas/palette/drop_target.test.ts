import type { FlowGraph, FlowGroup } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { addNodeAt, findDropGroup } from "@/web/canvas/palette/drop_target.js";

describe("findDropGroup", () => {
    it("returns the group that contains the point", () => {
        const graph = buildGraph([
            buildMap({ id: "develop", x: 0, y: 0, width: 400, height: 300 }),
        ]);

        expect(findDropGroup(graph, { x: 100, y: 100 })).toBe("develop");
    });

    it("returns the innermost group when groups are nested", () => {
        const graph = buildGraph([
            buildMap({ id: "outer", x: 0, y: 0, width: 800, height: 600 }),
            buildMap({
                id: "inner",
                x: 100,
                y: 100,
                width: 300,
                height: 200,
                parentGroupId: "outer",
            }),
        ]);

        expect(findDropGroup(graph, { x: 150, y: 150 })).toBe("inner");
    });

    it("returns the outer group when the point is outside the nested one", () => {
        const graph = buildGraph([
            buildMap({ id: "outer", x: 0, y: 0, width: 800, height: 600 }),
            buildMap({
                id: "inner",
                x: 100,
                y: 100,
                width: 300,
                height: 200,
                parentGroupId: "outer",
            }),
        ]);

        expect(findDropGroup(graph, { x: 600, y: 500 })).toBe("outer");
    });

    it("returns undefined when the point is outside every group", () => {
        const graph = buildGraph([
            buildMap({ id: "develop", x: 0, y: 0, width: 400, height: 300 }),
        ]);

        expect(findDropGroup(graph, { x: 500, y: 100 })).toBeUndefined();
    });
});

describe("addNodeAt", () => {
    it("adds a node of the type with its default ports at the point", () => {
        const point = { x: 120, y: 80 };

        const graph = addNodeAt(buildGraph([]), "agent", point, () => "nod_1");

        expect(graph.nodes).toEqual([createDefaultNode("agent", "nod_1", point)]);
    });

    it("puts the node inside the innermost group under the point", () => {
        const groups = [
            buildMap({ id: "outer", x: 0, y: 0, width: 800, height: 600 }),
            buildMap({
                id: "inner",
                x: 100,
                y: 100,
                width: 300,
                height: 200,
                parentGroupId: "outer",
            }),
        ];

        const graph = addNodeAt(buildGraph(groups), "script", { x: 150, y: 150 }, () => "nod_1");

        expect(graph.nodes[0]?.parentGroupId).toBe("inner");
    });

    it("keeps the existing nodes and uses a new id for each added node", () => {
        const ids = ["nod_1", "nod_2"];
        const newId = (): string => ids.shift() ?? "";

        const withOne = addNodeAt(buildGraph([]), "agent", { x: 0, y: 0 }, newId);
        const withTwo = addNodeAt(withOne, "git", { x: 300, y: 0 }, newId);

        expect(withTwo.nodes.map((node) => node.id)).toEqual(["nod_1", "nod_2"]);
    });
});

function buildGraph(groups: FlowGroup[]): FlowGraph {
    return { schemaVersion: 1, nodes: [], edges: [], groups };
}

function buildMap({
    id,
    x,
    y,
    width,
    height,
    parentGroupId,
}: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    parentGroupId?: string;
}): FlowGroup {
    return {
        id,
        kind: "map",
        label: id,
        parentGroupId,
        position: { x, y },
        size: { width, height },
        config: { concurrency: 1, barrier: false, failFast: false },
    };
}
