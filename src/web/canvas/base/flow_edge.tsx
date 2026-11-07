import { BaseEdge, getBezierPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import type { JSX } from "react";

import { cn } from "@/web/components/ui/cn.js";

// A type alias (not an interface) so it fits React Flow's Record<string, unknown> edge data.
export type FlowEdgeData = { flowing?: boolean; invalid?: boolean };

export type FlowEdgeProps = EdgeProps & { data?: FlowEdgeData };

export function FlowEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    data,
}: FlowEdgeProps): JSX.Element {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
    });

    return (
        <BaseEdge
            id={id}
            path={edgePath}
            markerEnd={markerEnd}
            className={cn(
                "flow-edge",
                data?.flowing && "flow-edge--flowing",
                data?.invalid && "flow-edge--invalid",
            )}
        />
    );
}
