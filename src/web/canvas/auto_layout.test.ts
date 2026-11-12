import { findGroup, findNode } from "@/engine/graph_queries.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { buildCanonicalFlow, buildLoopFlowWithExits } from "@/test/factories/flow_graph_factory.js";
import { autoLayout } from "@/web/canvas/auto_layout.js";
import { nodeFrame } from "@/web/canvas/group_frame_geometry.js";
import type { Frame } from "@/web/canvas/group_frame_geometry.js";

interface PlacedElement {
    id: string;
    parentGroupId?: string;
    frame: Frame;
}

const ORIGIN = { x: 0, y: 0 };
const UNIT_SIZE = { width: 1, height: 1 };

const FLOWS: [string, FlowGraph][] = [
    ["canonical flow", buildCanonicalFlow()],
    ["loop flow with exits", buildLoopFlowWithExits()],
];

function listPlacedElements(graph: FlowGraph): PlacedElement[] {
    return [
        ...graph.nodes.map((node) => ({ ...node, frame: nodeFrame(node) })),
        ...graph.groups.map((group) => ({ ...group, frame: group })),
    ];
}

function overlaps(a: Frame, b: Frame): boolean {
    return (
        a.position.x < b.position.x + b.size.width &&
        b.position.x < a.position.x + a.size.width &&
        a.position.y < b.position.y + b.size.height &&
        b.position.y < a.position.y + a.size.height
    );
}

function contains(outer: Frame, inner: Frame): boolean {
    return (
        inner.position.x >= outer.position.x &&
        inner.position.y >= outer.position.y &&
        inner.position.x + inner.size.width <= outer.position.x + outer.size.width &&
        inner.position.y + inner.size.height <= outer.position.y + outer.size.height
    );
}

function findOverlappingSiblings(graph: FlowGraph): string[] {
    const elements = listPlacedElements(graph);

    return elements.flatMap((element, index) =>
        elements
            .slice(index + 1)
            .filter((other) => other.parentGroupId === element.parentGroupId)
            .filter((other) => overlaps(element.frame, other.frame))
            .map((other) => `${element.id} × ${other.id}`),
    );
}

function findChildrenOutsideTheirGroup(graph: FlowGraph): string[] {
    return listPlacedElements(graph)
        .filter((element) => {
            const parent = findGroup(graph, element.parentGroupId);
            return parent !== undefined && !contains(parent, element.frame);
        })
        .map((element) => element.id);
}

describe("autoLayout", () => {
    it.each(FLOWS)("places no element of the %s over a sibling", async (_name, flow) => {
        const laidOut = await autoLayout(flow);

        expect(findOverlappingSiblings(laidOut)).toEqual([]);
    });

    it.each(FLOWS)("keeps every child of the %s inside its group frame", async (_name, flow) => {
        const laidOut = await autoLayout(flow);

        expect(findChildrenOutsideTheirGroup(laidOut)).toEqual([]);
    });

    it("lays the flow out from left to right", async () => {
        const laidOut = await autoLayout(buildCanonicalFlow());

        const triggerX = findNode(laidOut, "trigger")?.position.x ?? 0;
        const sourceX = findNode(laidOut, "source")?.position.x ?? 0;
        expect(triggerX).toBeLessThan(sourceX);
    });

    it("only moves and resizes: ids, parents, edges and configs stay", async () => {
        const flow = buildCanonicalFlow();

        const laidOut = await autoLayout(flow);

        const placementFree = (graph: FlowGraph): FlowGraph => ({
            ...graph,
            nodes: graph.nodes.map((node) => ({ ...node, position: ORIGIN })),
            groups: graph.groups.map((group) => ({ ...group, position: ORIGIN, size: UNIT_SIZE })),
        });
        expect(placementFree(laidOut)).toEqual(placementFree(flow));
    });

    it("leaves an empty flow empty", async () => {
        const emptyFlow: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };

        expect(await autoLayout(emptyFlow)).toEqual(emptyFlow);
    });
});
