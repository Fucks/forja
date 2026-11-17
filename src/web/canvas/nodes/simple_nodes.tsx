import type { NodeProps } from "@xyflow/react";
import { useContext } from "react";
import type { JSX } from "react";

import { ConnectionGraphContext } from "@/web/canvas/connection_hints.js";
import type { FlowRFNode } from "@/web/canvas/graph_mapping.js";
import { useAvailableDataFields } from "@/web/canvas/inspector/use_available_data.js";
import { FlowNodeCard } from "@/web/canvas/nodes/flow_node_card.js";
import { summarizeNode } from "@/web/canvas/nodes/node_summary.js";

// Trigger, source, script, condition, gate, git and output nodes differ only in their summary.
export function SimpleNode({ data, selected }: NodeProps<FlowRFNode>): JSX.Element {
    const node = data.flowNode;
    const graph = useContext(ConnectionGraphContext);
    // Only a Decisão names data in its summary, so only it pays for describing them.
    const dataFields = useAvailableDataFields(
        node.type === "condition" ? graph : undefined,
        node.id,
    );
    const { line1, line2 } = summarizeNode(node, { dataFields });

    return (
        <FlowNodeCard
            node={node}
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
