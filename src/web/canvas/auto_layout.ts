import elkBundle from "elkjs/lib/elk.bundled.js";
import type { ELK, ElkExtendedEdge, ElkNode, LayoutOptions } from "elkjs/lib/elk.bundled.js";

import type { FlowGraph, FlowGroup, Position } from "@/shared/flow_graph.js";
import {
    GROUP_LABEL_HEIGHT_PX,
    GROUP_PADDING_PX,
    nodeFrame,
} from "@/web/canvas/group_frame_geometry.js";
import type { Frame } from "@/web/canvas/group_frame_geometry.js";

const ROOT_ID = "root";
const ORIGIN: Position = { x: 0, y: 0 };
const NODE_SPACING_PX = 40;
const LAYER_SPACING_PX = 80;

const ROOT_LAYOUT_OPTIONS: LayoutOptions = {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    // Lays the edges that cross a group border out together with the nodes inside the groups.
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.spacing.nodeNode": String(NODE_SPACING_PX),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_SPACING_PX),
};

const GROUP_LAYOUT_OPTIONS: LayoutOptions = {
    "elk.padding": `[top=${GROUP_PADDING_PX + GROUP_LABEL_HEIGHT_PX},left=${GROUP_PADDING_PX},bottom=${GROUP_PADDING_PX},right=${GROUP_PADDING_PX}]`,
};

type PlacedFrames = Map<string, Frame>;

const elk = createElk();

export async function autoLayout(graph: FlowGraph): Promise<FlowGraph> {
    const layout = await elk.layout(toElkGraph(graph));

    return placeElements(graph, collectAbsoluteFrames(layout));
}

// elkjs ships CommonJS with ES module typings: the default import is the constructor itself.
function createElk(): ELK {
    const ElkConstructor = elkBundle as unknown as typeof elkBundle.default;

    return new ElkConstructor();
}

function toElkGraph(graph: FlowGraph): ElkNode {
    return {
        id: ROOT_ID,
        layoutOptions: ROOT_LAYOUT_OPTIONS,
        children: listElkChildren(graph, undefined),
        edges: listElkEdges(graph),
    };
}

// Groups become compound nodes, so ELK sizes each frame around the nodes laid out inside it.
function listElkChildren(graph: FlowGraph, parentGroupId: string | undefined): ElkNode[] {
    const childGroups = graph.groups.filter((group) => group.parentGroupId === parentGroupId);
    const childNodes = graph.nodes.filter((node) => node.parentGroupId === parentGroupId);

    return [
        ...childGroups.map((group) => toElkGroup(graph, group)),
        ...childNodes.map((node) => ({ id: node.id, ...nodeFrame(node).size })),
    ];
}

function toElkGroup(graph: FlowGraph, group: FlowGroup): ElkNode {
    const children = listElkChildren(graph, group.id);
    if (children.length === 0) {
        return { id: group.id, ...group.size };
    }

    return { id: group.id, layoutOptions: GROUP_LAYOUT_OPTIONS, children };
}

function listElkEdges(graph: FlowGraph): ElkExtendedEdge[] {
    const elementIds = new Set([...graph.nodes, ...graph.groups].map((element) => element.id));

    return graph.edges
        .filter((edge) => elementIds.has(edge.from.nodeId) && elementIds.has(edge.to.nodeId))
        .map((edge) => ({ id: edge.id, sources: [edge.from.nodeId], targets: [edge.to.nodeId] }));
}

// ELK places each child relative to its parent; the FlowGraph keeps absolute positions.
function collectAbsoluteFrames(layout: ElkNode): PlacedFrames {
    return new Map(listAbsoluteFrames(layout, ORIGIN));
}

function listAbsoluteFrames(layout: ElkNode, parentPosition: Position): [string, Frame][] {
    return (layout.children ?? []).flatMap((child): [string, Frame][] => {
        const frame = toAbsoluteFrame(child, parentPosition);
        return [[child.id, frame], ...listAbsoluteFrames(child, frame.position)];
    });
}

function toAbsoluteFrame(child: ElkNode, parentPosition: Position): Frame {
    return {
        position: { x: parentPosition.x + (child.x ?? 0), y: parentPosition.y + (child.y ?? 0) },
        size: { width: child.width ?? 0, height: child.height ?? 0 },
    };
}

function placeElements(graph: FlowGraph, frames: PlacedFrames): FlowGraph {
    return {
        ...graph,
        nodes: graph.nodes.map((node) => {
            const frame = frames.get(node.id);
            return frame ? { ...node, position: frame.position } : node;
        }),
        groups: graph.groups.map((group) => ({ ...group, ...frames.get(group.id) })),
    };
}
