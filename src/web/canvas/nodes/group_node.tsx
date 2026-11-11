import { NodeResizer } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { JSX } from "react";

import { GroupFrame } from "@/web/canvas/base/group_frame.js";
import type { GroupRFNode } from "@/web/canvas/graph_mapping.js";
import { useNodeLiveState } from "@/web/canvas/nodes/node_live_context.js";
import { describeGroupConfig } from "@/web/canvas/nodes/node_summary.js";
import { useIsDropTargetGroup } from "@/web/canvas/palette/drop_target_context.js";
import { useTargetValidation } from "@/web/canvas/validation_overlay.js";

const MIN_GROUP_WIDTH_PX = 160;
const MIN_GROUP_HEIGHT_PX = 96;

export function GroupNode({ data, selected }: NodeProps<GroupRFNode>): JSX.Element {
    const { flowGroup } = data;
    const { progress } = useNodeLiveState(flowGroup.id);
    const isDropTarget = useIsDropTargetGroup(flowGroup.id);
    const { invalid, issueMessages } = useTargetValidation(flowGroup.id);

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
                issueMessages={issueMessages}
            />
        </>
    );
}
