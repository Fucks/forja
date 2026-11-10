import { useStore } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import type { JSX, ReactNode } from "react";

import type { FlowNode } from "@/shared/flow_graph.js";
import { BaseNode } from "@/web/canvas/base/base_node.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import { NODE_TYPE_LABELS } from "@/web/canvas/base/node_type_labels.js";
import { useNodeLiveState } from "@/web/canvas/nodes/node_live_context.js";

const COMPACT_ZOOM_THRESHOLD = 0.5;

interface FlowNodeCardProps {
    node: FlowNode;
    selected: boolean;
    summary: ReactNode;
}

export function FlowNodeCard({ node, selected, summary }: FlowNodeCardProps): JSX.Element {
    const { status, badge } = useNodeLiveState(node.id);
    const isCompact = useStore(isZoomedOut);

    return (
        <BaseNode
            typeIcon={NODE_TYPE_ICONS[node.type]}
            typeLabel={NODE_TYPE_LABELS[node.type]}
            label={node.label}
            summary={summary}
            inputs={node.inputs}
            outputs={node.outputs}
            status={status}
            badge={badge}
            selected={selected}
            compact={isCompact}
        />
    );
}

function isZoomedOut(canvas: ReactFlowState): boolean {
    const [, , zoom] = canvas.transform;
    return zoom < COMPACT_ZOOM_THRESHOLD;
}
