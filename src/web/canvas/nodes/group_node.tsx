import { NodeResizer, useStore } from "@xyflow/react";
import type { NodeProps, ReactFlowState } from "@xyflow/react";
import type { JSX } from "react";

import { LOOP_EXHAUSTED_PORT } from "@/shared/flow_graph.js";
import type { FlowGroup } from "@/shared/flow_graph.js";
import { GroupFrame } from "@/web/canvas/base/group_frame.js";
import type { PortView } from "@/web/canvas/base/port_handle.js";
import { describeLoopExhaustedPort } from "@/web/canvas/base/port_label.js";
import type { GroupRFNode } from "@/web/canvas/graph_mapping.js";
import { useNodeLiveState } from "@/web/canvas/nodes/node_live_context.js";
import { describeGroupConfig } from "@/web/canvas/nodes/node_summary.js";
import { useIsDropTargetGroup } from "@/web/canvas/palette/drop_target_context.js";
import { useTargetValidation } from "@/web/canvas/validation_overlay.js";

const MIN_GROUP_WIDTH_PX = 160;
const MIN_GROUP_HEIGHT_PX = 96;

// The item leaves through it like through any work item output, so it connects like one.
const LOOP_EXHAUSTED_OUTPUT: PortView = {
    name: LOOP_EXHAUSTED_PORT,
    type: "workItem",
    ...describeLoopExhaustedPort(),
};

export function GroupNode({ data, selected }: NodeProps<GroupRFNode>): JSX.Element {
    const { flowGroup } = data;
    const { progress } = useNodeLiveState(flowGroup.id);
    const isDropTarget = useIsDropTargetGroup(flowGroup.id);
    const { invalid, issueMessages } = useTargetValidation(flowGroup.id);
    const isEmpty = useStore((state) => !hasChildren(state, flowGroup.id));

    return (
        <>
            <NodeResizer
                isVisible={selected}
                minWidth={MIN_GROUP_WIDTH_PX}
                minHeight={MIN_GROUP_HEIGHT_PX}
            />
            <GroupFrame
                kind={flowGroup.kind}
                label={flowGroup.label}
                configLabel={describeGroupConfig(flowGroup)}
                progress={progress}
                selected={selected || isDropTarget}
                invalid={invalid}
                isEmpty={isEmpty}
                issueMessages={issueMessages}
                outputs={listGroupOutputs(flowGroup)}
            />
        </>
    );
}

function listGroupOutputs(group: FlowGroup): PortView[] {
    return group.kind === "loop" ? [LOOP_EXHAUSTED_OUTPUT] : [];
}

function hasChildren({ nodes }: ReactFlowState, groupId: string): boolean {
    return nodes.some((node) => node.parentId === groupId);
}
