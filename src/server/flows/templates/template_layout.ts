import type {
    FlowGroup,
    FlowNode,
    LoopConfig,
    MapConfig,
    NodeOfType,
    NodeType,
    Position,
} from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";

export interface CanvasCell {
    column: number;
    row?: number;
}

export interface ColumnSpan {
    first: number;
    count: number;
}

const COLUMN_WIDTH_PX = 320;
const ROW_HEIGHT_PX = 160;
const NODE_WIDTH_PX = 240;
const NODE_HEIGHT_PX = 100;
const ROWS_PER_GROUP = 3;
// A loop sits inside a map, so its frame must be the tighter one.
const LOOP_PADDING_PX = 16;
const MAP_PADDING_PX = 2 * LOOP_PADDING_PX;

export function createTemplateNode<Type extends NodeType>(
    type: Type,
    id: string,
    cell: CanvasCell,
): NodeOfType<Type> {
    const node = createDefaultNode(type, id, cellPosition(cell));
    if (!isNodeOfType(node, type)) {
        throw new Error(`createDefaultNode("${type}") returned a ${node.type} node`);
    }

    return node;
}

export function placeInGroup(node: FlowNode, group: FlowGroup): FlowNode {
    return { ...node, parentGroupId: group.id };
}

export function buildMapGroup(group: {
    id: string;
    label: string;
    columns: ColumnSpan;
    config: Pick<MapConfig, "concurrency">;
}): FlowGroup {
    return {
        id: group.id,
        kind: "map",
        label: group.label,
        ...frameColumns(group.columns, MAP_PADDING_PX),
        config: { concurrency: group.config.concurrency, barrier: false, failFast: false },
    };
}

export function buildLoopGroup(group: {
    id: string;
    label: string;
    parentGroupId: string;
    columns: ColumnSpan;
    config: LoopConfig;
}): FlowGroup {
    return {
        id: group.id,
        kind: "loop",
        label: group.label,
        parentGroupId: group.parentGroupId,
        ...frameColumns(group.columns, LOOP_PADDING_PX),
        config: group.config,
    };
}

function frameColumns(
    columns: ColumnSpan,
    paddingPx: number,
): Pick<FlowGroup, "position" | "size"> {
    const topLeft = cellPosition({ column: columns.first });

    return {
        position: { x: topLeft.x - paddingPx, y: topLeft.y - paddingPx },
        size: {
            width: (columns.count - 1) * COLUMN_WIDTH_PX + NODE_WIDTH_PX + 2 * paddingPx,
            height: (ROWS_PER_GROUP - 1) * ROW_HEIGHT_PX + NODE_HEIGHT_PX + 2 * paddingPx,
        },
    };
}

function cellPosition({ column, row = 0 }: CanvasCell): Position {
    return { x: column * COLUMN_WIDTH_PX, y: row * ROW_HEIGHT_PX };
}

function isNodeOfType<Type extends NodeType>(node: FlowNode, type: Type): node is NodeOfType<Type> {
    return node.type === type;
}
