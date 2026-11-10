import type { NodeProps } from "@xyflow/react";
import type { JSX } from "react";

import type { FlowRFNode } from "@/web/canvas/graph_mapping.js";
import { FlowNodeCard } from "@/web/canvas/nodes/flow_node_card.js";
import { summarizeNode } from "@/web/canvas/nodes/node_summary.js";

// The agent is the node people look for first, so its model and effort stand out from the muted text.
export function AgentNode({ data, selected }: NodeProps<FlowRFNode>): JSX.Element {
    const { line1, line2 } = summarizeNode(data.flowNode);

    return (
        <FlowNodeCard
            node={data.flowNode}
            selected={selected}
            summary={
                <div className="flex flex-col gap-0.5">
                    <span className="truncate text-text">{line1}</span>
                    {line2 !== undefined && <span className="truncate font-sans">{line2}</span>}
                </div>
            }
        />
    );
}
