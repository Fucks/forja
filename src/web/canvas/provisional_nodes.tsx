import { useStore } from "@xyflow/react";
import type { NodeProps, NodeTypes, ReactFlowState } from "@xyflow/react";
import type { JSX } from "react";

import { NODE_TYPES } from "@/shared/flow_graph.js";
import { BaseNode } from "@/web/canvas/base/base_node.js";
import { GroupFrame } from "@/web/canvas/base/group_frame.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import { NODE_TYPE_LABELS } from "@/web/canvas/base/node_type_labels.js";
import { GROUP_NODE_TYPE } from "@/web/canvas/graph_mapping.js";
import type { FlowRFNode, GroupRFNode } from "@/web/canvas/graph_mapping.js";
import { describeGroupConfig } from "@/web/canvas/nodes/node_summary.js";

const COMPACT_ZOOM_THRESHOLD = 0.5;

// Every node type draws the same generic node until #31 adds one component per type.
export const PROVISIONAL_NODE_TYPES: NodeTypes = {
    ...Object.fromEntries(NODE_TYPES.map((type) => [type, ProvisionalNode])),
    [GROUP_NODE_TYPE]: ProvisionalGroup,
};

function ProvisionalNode({ data, selected }: NodeProps<FlowRFNode>): JSX.Element {
    const { flowNode } = data;
    const isCompact = useStore(isZoomedOut);

    return (
        <BaseNode
            typeIcon={NODE_TYPE_ICONS[flowNode.type]}
            typeLabel={NODE_TYPE_LABELS[flowNode.type]}
            label={flowNode.label}
            inputs={flowNode.inputs}
            outputs={flowNode.outputs}
            selected={selected}
            compact={isCompact}
        />
    );
}

function isZoomedOut(canvas: ReactFlowState): boolean {
    const [, , zoom] = canvas.transform;
    return zoom < COMPACT_ZOOM_THRESHOLD;
}

function ProvisionalGroup({ data, selected }: NodeProps<GroupRFNode>): JSX.Element {
    const { flowGroup } = data;

    return (
        <GroupFrame
            kind={flowGroup.kind}
            label={flowGroup.label}
            configLabel={describeGroupConfig(flowGroup)}
            selected={selected}
        />
    );
}
