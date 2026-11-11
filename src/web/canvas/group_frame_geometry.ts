import type { FlowGroup, FlowNode } from "@/shared/flow_graph.js";

export type Frame = Pick<FlowGroup, "position" | "size">;

// The graph keeps no node sizes; every node card is drawn 240 px wide (`w-60`).
const NODE_FRAME_SIZE: FlowGroup["size"] = { width: 240, height: 120 };
const GROUP_PADDING_PX = 40;
const GROUP_LABEL_HEIGHT_PX = 32;

export function nodeFrame(node: FlowNode): Frame {
    return { position: node.position, size: NODE_FRAME_SIZE };
}

export function frameAround(contents: Frame[]): Frame {
    const { position, size } = boundingFrame(contents);

    return {
        position: {
            x: position.x - GROUP_PADDING_PX,
            y: position.y - GROUP_PADDING_PX - GROUP_LABEL_HEIGHT_PX,
        },
        size: {
            width: size.width + 2 * GROUP_PADDING_PX,
            height: size.height + 2 * GROUP_PADDING_PX + GROUP_LABEL_HEIGHT_PX,
        },
    };
}

export function boundingFrame(frames: Frame[]): Frame {
    const left = Math.min(...frames.map(({ position }) => position.x));
    const top = Math.min(...frames.map(({ position }) => position.y));
    const right = Math.max(...frames.map(frameRight));
    const bottom = Math.max(...frames.map(frameBottom));

    return { position: { x: left, y: top }, size: { width: right - left, height: bottom - top } };
}

function frameRight({ position, size }: Frame): number {
    return position.x + size.width;
}

function frameBottom({ position, size }: Frame): number {
    return position.y + size.height;
}
