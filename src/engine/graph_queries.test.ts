import {
    areTypesCompatible,
    CycleOutsideLoopError,
    enclosingGroups,
    enclosingMapGroup,
    groupBoundaryEdges,
    groupMembers,
    incomingEdges,
    isItemCorrelatedEdge,
    outgoingEdges,
    topologicalOrder,
} from "@/engine/graph_queries.js";
import type { FlowEdge } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { buildCanonicalFlow, buildLoopFlow, connect } from "@/test/factories/flow_graph_factory.js";
import {
    addEdges,
    addGroups,
    addNodes,
    buildMapGroup,
    findEdge,
    moveGroup,
} from "@/test/factories/flow_graph_variations.js";

describe("incomingEdges and outgoingEdges", () => {
    it("list the edges that arrive at and leave a node", () => {
        const graph = buildLoopFlow();

        expect(edgeIds(incomingEdges(graph, "review"))).toEqual([
            "dev.summary->review.context",
            "tests.result->review.tests",
        ]);
        expect(edgeIds(outgoingEdges(graph, "review"))).toEqual(["review.summary->dev.notes"]);
    });
});

describe("groupMembers", () => {
    it("lists only the direct nodes and child groups of a group", () => {
        const graph = buildLoopFlow();

        expect(groupMembers(graph, "items")).toEqual({
            nodeIds: [],
            childGroupIds: ["review_loop"],
        });
        expect(groupMembers(graph, "review_loop")).toEqual({
            nodeIds: ["dev", "tests", "review"],
            childGroupIds: [],
        });
    });
});

describe("enclosingGroups", () => {
    it("lists the groups around a node from the innermost to the outermost", () => {
        const graph = buildLoopFlow();

        expect(groupIds(enclosingGroups(graph, "dev"))).toEqual(["review_loop", "items"]);
    });

    it("returns no groups for a node outside every group", () => {
        expect(enclosingGroups(buildLoopFlow(), "source")).toEqual([]);
    });

    it("stops at a parent group that does not exist", () => {
        const graph = moveGroup(buildLoopFlow(), "review_loop", { parentGroupId: "missing" });

        expect(groupIds(enclosingGroups(graph, "dev"))).toEqual(["review_loop"]);
    });

    it("visits each group once when parents form a cycle", () => {
        const graph = moveGroup(buildLoopFlow(), "items", { parentGroupId: "review_loop" });

        expect(groupIds(enclosingGroups(graph, "dev"))).toEqual(["review_loop", "items"]);
    });
});

describe("enclosingMapGroup", () => {
    it("finds the innermost map around a node, skipping loops", () => {
        expect(enclosingMapGroup(buildLoopFlow(), "dev")?.id).toBe("items");
    });

    it("finds no map for a node outside every map", () => {
        expect(enclosingMapGroup(buildCanonicalFlow(), "source")).toBeUndefined();
    });
});

describe("groupBoundaryEdges", () => {
    it("separates the edges entering and leaving a map", () => {
        const boundary = groupBoundaryEdges(buildCanonicalFlow(), "develop");

        expect(edgeIds(boundary.entering)).toEqual(["tl.summary->dev.spec"]);
        expect(edgeIds(boundary.leaving)).toEqual(["dev.summary->reviewer.context"]);
        expect(boundary.back).toEqual([]);
    });

    it("finds the back edge that repeats a loop", () => {
        const boundary = groupBoundaryEdges(buildLoopFlow(), "review_loop");

        expect(edgeIds(boundary.entering)).toEqual(["source.items->dev.item"]);
        expect(boundary.leaving).toEqual([]);
        expect(edgeIds(boundary.back)).toEqual(["review.summary->dev.notes"]);
    });
});

describe("topologicalOrder", () => {
    it("orders the nodes after their inputs, breaking ties by id", () => {
        expect(topologicalOrder(buildCanonicalFlow())).toEqual([
            "output",
            "trigger",
            "source",
            "tl",
            "dev",
            "reviewer",
            "open_pr",
        ]);
    });

    it("ignores the back edges inside loops", () => {
        expect(topologicalOrder(buildLoopFlow())).toEqual([
            "tests",
            "trigger",
            "source",
            "dev",
            "review",
        ]);
    });

    it("throws when there is a cycle outside a loop", () => {
        const graph = addEdges(buildCanonicalFlow(), [
            connect(["reviewer", "summary"], ["tl", "context"]),
        ]);

        expect(() => topologicalOrder(graph)).toThrow(CycleOutsideLoopError);
    });
});

describe("areTypesCompatible", () => {
    it.each([
        ["text", "text"],
        ["any", "workItem"],
        ["prUrl", "any"],
    ] as const)("accepts %s → %s", (from, to) => {
        expect(areTypesCompatible(from, to)).toBe(true);
    });

    it.each([
        ["text", "json"],
        ["workItem", "workItemList"],
        ["workItemList", "workItem"],
    ] as const)("rejects %s → %s", (from, to) => {
        expect(areTypesCompatible(from, to)).toBe(false);
    });
});

describe("isItemCorrelatedEdge", () => {
    it("is true for an edge between sibling maps", () => {
        const graph = buildCanonicalFlow();

        expect(isItemCorrelatedEdge(graph, findEdge(graph, "tl.summary->dev.spec"))).toBe(true);
    });

    it("is false for an edge entering a map from outside", () => {
        const graph = buildCanonicalFlow();

        expect(isItemCorrelatedEdge(graph, findEdge(graph, "source.items->tl.item"))).toBe(false);
    });

    it("is false for an edge inside the same map", () => {
        const graph = buildCanonicalFlow();
        const edge = findEdge(graph, "reviewer.summary->open_pr.body");

        expect(isItemCorrelatedEdge(graph, edge)).toBe(false);
    });

    it("is false for an edge into a map nested in the source map", () => {
        const canonicalFlow = buildCanonicalFlow();
        const nestedMap = buildMapGroup("nested", { parentGroupId: "develop" });
        const nestedNode = createDefaultNode("agent", "nested_agent", { x: 0, y: 0 });
        const edge = connect(["dev", "summary"], ["nested_agent", "context"]);
        const graph = addNodes(addGroups(canonicalFlow, [nestedMap]), [
            { ...nestedNode, parentGroupId: "nested" },
        ]);

        expect(isItemCorrelatedEdge(graph, edge)).toBe(false);
    });
});

function edgeIds(edges: FlowEdge[]): string[] {
    return edges.map((edge) => edge.id);
}

function groupIds(groups: { id: string }[]): string[] {
    return groups.map((group) => group.id);
}
