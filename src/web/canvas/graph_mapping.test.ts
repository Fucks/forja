import type { FlowGraph, FlowGroup, Position } from "@/shared/flow_graph.js";
import { buildCanonicalFlow, buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import { fromReactFlow, toReactFlow } from "@/web/canvas/graph_mapping.js";
import type { RFNode } from "@/web/canvas/graph_mapping.js";

function findNode(nodes: RFNode[], id: string): RFNode {
    const node = nodes.find((candidate) => candidate.id === id);
    if (!node) {
        throw new Error(`No React Flow node with id "${id}"`);
    }

    return node;
}

function findFlowNodePosition(graph: FlowGraph, id: string): Position {
    const node = graph.nodes.find((candidate) => candidate.id === id);
    if (!node) {
        throw new Error(`No flow node with id "${id}"`);
    }

    return node.position;
}

function findGroup(graph: FlowGraph, id: string): FlowGroup {
    const group = graph.groups.find((candidate) => candidate.id === id);
    if (!group) {
        throw new Error(`No flow group with id "${id}"`);
    }

    return group;
}

function offsetBetween(from: Position, to: Position): Position {
    return { x: to.x - from.x, y: to.y - from.y };
}

function moveNode(nodes: RFNode[], id: string, offset: Position): RFNode[] {
    return nodes.map((node) => {
        if (node.id !== id) {
            return node;
        }

        return {
            ...node,
            position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
        };
    });
}

describe("toReactFlow", () => {
    it("turns every group into a group node and every flow node into a node of its type", () => {
        const graph = buildCanonicalFlow();

        const { nodes } = toReactFlow(graph);

        expect(nodes.filter((node) => node.type === "group")).toHaveLength(graph.groups.length);
        expect(nodes.filter((node) => node.type !== "group").map((node) => node.type)).toEqual(
            graph.nodes.map((node) => node.type),
        );
    });

    it("places a node inside a group relative to the group", () => {
        const graph = buildCanonicalFlow();
        const groupPosition = findGroup(graph, "specify").position;

        const { nodes } = toReactFlow(graph);

        const techLeadNode = findNode(nodes, "tl");
        expect(techLeadNode.parentId).toBe("specify");
        expect(techLeadNode.position).toEqual(
            offsetBetween(groupPosition, findFlowNodePosition(graph, "tl")),
        );
    });

    it("places a group inside another group relative to its parent group", () => {
        const graph = buildLoopFlow();
        const itemsGroup = findGroup(graph, "items");
        const reviewLoop = findGroup(graph, "review_loop");

        const { nodes } = toReactFlow(graph);

        const loopNode = findNode(nodes, "review_loop");
        expect(loopNode.parentId).toBe("items");
        expect(loopNode.position).toEqual(offsetBetween(itemsGroup.position, reviewLoop.position));
    });

    it("lists every parent before its children", () => {
        const graph = buildLoopFlow();

        const { nodes } = toReactFlow(graph);

        const ids = nodes.map((node) => node.id);
        for (const node of nodes) {
            if (node.parentId) {
                expect(ids.indexOf(node.parentId)).toBeLessThan(ids.indexOf(node.id));
            }
        }
    });

    it("sizes group nodes with the group's saved size", () => {
        const graph = buildCanonicalFlow();
        const group = findGroup(graph, "develop");

        const { nodes } = toReactFlow(graph);

        const groupNode = findNode(nodes, "develop");
        expect({ width: groupNode.width, height: groupNode.height }).toEqual(group.size);
    });

    it("connects edges through the ports as handles", () => {
        const graph = buildCanonicalFlow();

        const { edges } = toReactFlow(graph);

        expect(edges).toContainEqual(
            expect.objectContaining({
                source: "tl",
                sourceHandle: "summary",
                target: "dev",
                targetHandle: "spec",
            }),
        );
    });
});

describe("fromReactFlow", () => {
    it.each([
        ["canonical", buildCanonicalFlow],
        ["loop", buildLoopFlow],
    ])("gives back the %s flow unchanged", (_name, buildFlow) => {
        const graph = buildFlow();
        const { nodes, edges } = toReactFlow(graph);

        const roundTrip = fromReactFlow(nodes, edges, graph);

        expect(roundTrip).toEqual(graph);
    });

    it("saves the absolute position of a node moved inside nested groups", () => {
        const graph = buildLoopFlow();
        const before = findFlowNodePosition(graph, "tests");
        const { nodes, edges } = toReactFlow(graph);

        const moved = fromReactFlow(moveNode(nodes, "tests", { x: 15, y: 25 }), edges, graph);

        expect(findFlowNodePosition(moved, "tests")).toEqual({
            x: before.x + 15,
            y: before.y + 25,
        });
    });

    it("moves the nodes inside a group together with the group", () => {
        const graph = buildLoopFlow();
        const before = findFlowNodePosition(graph, "dev");
        const { nodes, edges } = toReactFlow(graph);

        const moved = fromReactFlow(moveNode(nodes, "items", { x: -40, y: 10 }), edges, graph);

        expect(findFlowNodePosition(moved, "dev")).toEqual({ x: before.x - 40, y: before.y + 10 });
    });

    it("keeps the node configs from the previous graph", () => {
        const graph = buildCanonicalFlow();
        const { nodes, edges } = toReactFlow(graph);

        const moved = fromReactFlow(moveNode(nodes, "dev", { x: 5, y: 5 }), edges, graph);

        expect(moved.nodes.map((node) => node.config)).toEqual(
            graph.nodes.map((node) => node.config),
        );
    });

    it("drops the nodes and edges that are no longer on the canvas", () => {
        const graph = buildCanonicalFlow();
        const { nodes, edges } = toReactFlow(graph);

        const remaining = fromReactFlow(
            nodes.filter((node) => node.id !== "output"),
            edges.slice(1),
            graph,
        );

        expect(remaining.nodes.map((node) => node.id)).not.toContain("output");
        expect(remaining.edges).toEqual(graph.edges.slice(1));
    });
});
