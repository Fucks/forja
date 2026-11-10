import type { NodeProps } from "@xyflow/react";
import type { JSX } from "react";

import type { FlowRFNode } from "@/web/canvas/graph_mapping.js";
import { FlowNodeCard } from "@/web/canvas/nodes/flow_node_card.js";
import { summarizeNode } from "@/web/canvas/nodes/node_summary.js";

// Trigger, source, script, condition, gate, git and output nodes differ only in their summary.
export function SimpleNode({ data, selected }: NodeProps<FlowRFNode>): JSX.Element {
    const { line1, line2 } = summarizeNode(data.flowNode);

    return (
        <FlowNodeCard
            node={data.flowNode}
            selected={selected}
            summary={
                <div className="flex flex-col">
                    <span className="truncate">{line1}</span>
                    {line2 !== undefined && <span className="truncate">{line2}</span>}
                </div>
            }
        />
    );
}
