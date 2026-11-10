import type { NodeProps } from "@xyflow/react";
import type { JSX } from "react";

import { GroupFrame } from "@/web/canvas/base/group_frame.js";
import type { GroupRFNode } from "@/web/canvas/graph_mapping.js";
import { useNodeLiveState } from "@/web/canvas/nodes/node_live_context.js";
import { describeGroupConfig } from "@/web/canvas/nodes/node_summary.js";

export function GroupNode({ data, selected }: NodeProps<GroupRFNode>): JSX.Element {
    const { flowGroup } = data;
    const { progress } = useNodeLiveState(flowGroup.id);

    return (
        <GroupFrame
            kind={flowGroup.kind}
            label={flowGroup.label}
            configLabel={describeGroupConfig(flowGroup)}
            progress={progress}
            selected={selected}
        />
    );
}
