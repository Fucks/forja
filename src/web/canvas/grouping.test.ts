import { validateFlowGraph } from "@/engine/graph_validation.js";
import type { FlowGraph, FlowGroup, FlowNode, NodeType, Position } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { connect } from "@/test/factories/flow_graph_factory.js";
import {
    canGroup,
    createEmptyGroup,
    EMPTY_GROUP_SIZE,
    EMPTY_SELECTION_REASON,
    fitGroupToChildren,
    groupNodes,
    GroupingRejectedError,
    MIXED_GROUPS_REASON,
    reparentNode,
    TRIGGER_INSIDE_GROUP_REASON,
    ungroup,
} from "@/web/canvas/grouping.js";

const GROUP_ID = "grp_new";
const INNER_GROUP_ID = "grp_inner";

describe("canGroup", () => {
    it("accepts nodes that share the same group", () => {
        expect(canGroup(buildFlow(), ["tl", "dev"])).toEqual({ ok: true });
    });

    it("asks for at least one node when nothing is selected", () => {
        expect(canGroup(buildFlow(), [])).toEqual({ ok: false, reason: EMPTY_SELECTION_REASON });
    });

    it("ignores ids that are not nodes", () => {
        expect(canGroup(buildFlow(), ["develop"])).toEqual({
            ok: false,
            reason: EMPTY_SELECTION_REASON,
        });
    });

    it("refuses nodes from different groups", () => {
        expect(canGroup(buildFlow(), ["dev", "source"])).toEqual({
            ok: false,
            reason: MIXED_GROUPS_REASON,
        });
    });

    it("refuses to put the trigger inside a group", () => {
        expect(canGroup(buildFlow(), ["trigger", "source"])).toEqual({
            ok: false,
            reason: TRIGGER_INSIDE_GROUP_REASON,
        });
    });
});

describe("groupNodes", () => {
    it("creates a map with concurrency 1 that holds the selected node", () => {
        const { graph, groupId } = groupNodes(buildFlow(), ["source"], "map", () => GROUP_ID);

        expect(groupId).toBe(GROUP_ID);
        expect(findGroupIn(graph, GROUP_ID)).toMatchObject({
            kind: "map",
            config: { concurrency: 1, barrier: false, failFast: false },
        });
        expect(findNodeIn(graph, "source").parentGroupId).toBe(GROUP_ID);
    });

    it("creates a loop of 3 iterations whose exit condition is still undefined", () => {
        const { graph } = groupNodes(buildFlow(), ["source"], "loop", () => GROUP_ID);

        expect(findGroupIn(graph, GROUP_ID)).toMatchObject({
            kind: "loop",
            config: { maxIterations: 3, until: { op: "exists", path: "" }, carry: [] },
        });
    });

    it("leaves a new loop flagged as an error until its condition is defined", () => {
        const { graph } = groupNodes(buildFlow(), ["source"], "loop", () => GROUP_ID);

        expect(validateFlowGraph(graph)).toContainEqual(
            expect.objectContaining({ level: "error", code: "loop_without_condition" }),
        );
    });

    it("frames the nodes with 40 px of padding and 32 px more on top for the label", () => {
        const { graph } = groupNodes(buildFlow(), ["source"], "map", () => GROUP_ID);

        expect(findGroupIn(graph, GROUP_ID)).toMatchObject({
            position: { x: 260, y: 28 },
            size: { width: 320, height: 232 },
        });
    });

    it("frames several nodes together", () => {
        const { graph } = groupNodes(buildFlow(), ["tl", "dev"], "map", () => GROUP_ID);

        expect(findGroupIn(graph, GROUP_ID)).toMatchObject({
            position: { x: 560, y: 28 },
            size: { width: 320, height: 432 },
        });
    });

    it("keeps the absolute positions of the grouped nodes", () => {
        const flow = buildFlow();

        const { graph } = groupNodes(flow, ["dev"], "loop", () => GROUP_ID);

        expect(findNodeIn(graph, "dev").position).toEqual(findNodeIn(flow, "dev").position);
    });

    it("nests the new group inside the common group of the nodes", () => {
        const { graph } = groupNodes(buildFlow(), ["dev"], "loop", () => GROUP_ID);

        expect(findGroupIn(graph, GROUP_ID).parentGroupId).toBe("develop");
        expect(findNodeIn(graph, "dev").parentGroupId).toBe(GROUP_ID);
    });

    it("grows the enclosing group so the new group fits inside it", () => {
        const tightMap = fitGroupToChildren(buildFlow(), "develop");

        const { graph } = groupNodes(tightMap, ["dev"], "loop", () => GROUP_ID);

        const loopFrame = findGroupIn(graph, GROUP_ID);
        const mapFrame = findGroupIn(graph, "develop");
        expect(mapFrame.position.x).toBeLessThan(loopFrame.position.x);
        expect(mapFrame.position.y).toBeLessThan(loopFrame.position.y);
        expect(rightEdge(mapFrame)).toBeGreaterThan(rightEdge(loopFrame));
        expect(bottomEdge(mapFrame)).toBeGreaterThan(bottomEdge(loopFrame));
    });

    it("throws the refusal reason when the nodes cannot be grouped", () => {
        expect(() => groupNodes(buildFlow(), ["dev", "source"], "map", () => GROUP_ID)).toThrow(
            new GroupingRejectedError(MIXED_GROUPS_REASON),
        );
    });
});

describe("createEmptyGroup", () => {
    it("creates an empty map at the point, outside any group", () => {
        const { graph, groupId } = createEmptyGroup(
            buildFlow(),
            "map",
            { x: 0, y: 400 },
            () => GROUP_ID,
        );

        expect(groupId).toBe(GROUP_ID);
        expect(findGroupIn(graph, GROUP_ID)).toEqual({
            id: GROUP_ID,
            kind: "map",
            label: "Map",
            parentGroupId: undefined,
            position: { x: 0, y: 400 },
            size: EMPTY_GROUP_SIZE,
            config: { concurrency: 1, barrier: false, failFast: false },
        });
        expect(graph.nodes).toEqual(buildFlow().nodes);
    });

    it("creates a loop whose exit is still to be defined", () => {
        const { graph } = createEmptyGroup(buildFlow(), "loop", { x: 0, y: 400 }, () => GROUP_ID);

        expect(findGroupIn(graph, GROUP_ID)).toMatchObject({ kind: "loop", label: "Loop" });
    });

    it("nests the group in the group under the point and widens that group to hold it", () => {
        const { graph } = createEmptyGroup(buildFlow(), "loop", { x: 700, y: 500 }, () => GROUP_ID);

        const develop = findGroupIn(graph, "develop");
        const created = findGroupIn(graph, GROUP_ID);
        expect(created.parentGroupId).toBe("develop");
        expect(rightEdge(develop)).toBeGreaterThan(rightEdge(created));
        expect(bottomEdge(develop)).toBeGreaterThan(bottomEdge(created));
    });
});

describe("ungroup", () => {
    it("moves the nodes of a top-level group out of any group", () => {
        const graph = ungroup(buildFlow(), "develop");

        expect(findNodeIn(graph, "dev").parentGroupId).toBeUndefined();
        expect(graph.groups).toEqual([]);
    });

    it("returns the nodes of a loop inside a map to the map", () => {
        const { graph: nested } = groupNodes(buildFlow(), ["dev"], "loop", () => INNER_GROUP_ID);

        const graph = ungroup(nested, INNER_GROUP_ID);

        expect(findNodeIn(graph, "dev").parentGroupId).toBe("develop");
        expect(graph.groups.map((group) => group.id)).toEqual(["develop"]);
    });

    it("lifts the inner groups to the parent of the removed group", () => {
        const { graph: nested } = groupNodes(buildFlow(), ["dev"], "loop", () => INNER_GROUP_ID);

        const graph = ungroup(nested, "develop");

        expect(findGroupIn(graph, INNER_GROUP_ID).parentGroupId).toBeUndefined();
    });

    it("keeps the edges between nodes", () => {
        const flow = buildFlow();

        expect(ungroup(flow, "develop").edges).toEqual(flow.edges);
    });

    it("drops the edges that leave from the removed group itself", () => {
        const flow = {
            ...buildFlow(),
            edges: [connect(["develop", "exhausted"], ["source", "trigger"])],
        };

        expect(ungroup(flow, "develop").edges).toEqual([]);
    });
});

describe("reparentNode", () => {
    it("removes the group of a node dropped outside every group", () => {
        const graph = reparentNode(buildFlow(), "dev", { x: 10, y: 600 });

        expect(findNodeIn(graph, "dev").parentGroupId).toBeUndefined();
    });

    it("puts a node dropped inside a group into that group", () => {
        const graph = reparentNode(buildFlow(), "source", { x: 650, y: 200 });

        expect(findNodeIn(graph, "source").parentGroupId).toBe("develop");
    });

    it("puts a node into the innermost group under the drop point", () => {
        const { graph: nested } = groupNodes(buildFlow(), ["dev"], "loop", () => INNER_GROUP_ID);

        const graph = reparentNode(nested, "tl", { x: 650, y: 300 });

        expect(findNodeIn(graph, "tl").parentGroupId).toBe(INNER_GROUP_ID);
    });

    it("keeps the trigger outside of groups", () => {
        const flow = buildFlow();

        expect(reparentNode(flow, "trigger", { x: 650, y: 200 })).toBe(flow);
    });
});

describe("fitGroupToChildren", () => {
    it("frames the group around its nodes", () => {
        const graph = fitGroupToChildren(buildFlow(), "develop");

        expect(findGroupIn(graph, "develop")).toMatchObject({
            position: { x: 560, y: 28 },
            size: { width: 320, height: 432 },
        });
    });

    it("frames a group around its inner groups", () => {
        const { graph: nested } = groupNodes(buildFlow(), ["dev"], "loop", () => INNER_GROUP_ID);

        const graph = fitGroupToChildren(nested, "develop");

        const innerFrame = findGroupIn(graph, INNER_GROUP_ID);
        expect(findGroupIn(graph, "develop").position.x).toBe(innerFrame.position.x - 40);
    });

    it("keeps an empty group as it is", () => {
        const flow = { ...buildFlow(), nodes: [] };

        expect(fitGroupToChildren(flow, "develop")).toBe(flow);
    });
});

// trigger (0, 100) · source (300, 100) · map "develop" holding tl (600, 100) and dev (600, 300)
function buildFlow(): FlowGraph {
    const developGroup: FlowGroup = {
        id: "develop",
        kind: "map",
        label: "Desenvolver",
        position: { x: 540, y: 0 },
        size: { width: 400, height: 560 },
        config: { concurrency: 1, barrier: false, failFast: false },
    };

    return {
        schemaVersion: 2,
        nodes: [
            buildNode("trigger", "trigger", { x: 0, y: 100 }),
            buildNode("source", "source", { x: 300, y: 100 }),
            { ...buildNode("tl", "agent", { x: 600, y: 100 }), parentGroupId: developGroup.id },
            { ...buildNode("dev", "agent", { x: 600, y: 300 }), parentGroupId: developGroup.id },
        ],
        edges: [connect(["tl", "summary"], ["dev", "spec"])],
        groups: [developGroup],
    };
}

function buildNode(id: string, type: NodeType, position: Position): FlowNode {
    return createDefaultNode(type, id, position);
}

function findNodeIn(graph: FlowGraph, nodeId: string): FlowNode {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
        throw new Error(`Node ${nodeId} not found`);
    }

    return node;
}

function findGroupIn(graph: FlowGraph, groupId: string): FlowGroup {
    const group = graph.groups.find((candidate) => candidate.id === groupId);
    if (!group) {
        throw new Error(`Group ${groupId} not found`);
    }

    return group;
}

function rightEdge({ position, size }: FlowGroup): number {
    return position.x + size.width;
}

function bottomEdge({ position, size }: FlowGroup): number {
    return position.y + size.height;
}
