import { Handle, Position } from "@xyflow/react";
import type { HandleType } from "@xyflow/react";
import type { JSX } from "react";

import { cn } from "@/web/components/ui/cn.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

type PortSide = "left" | "right";

const HANDLE_TYPE_BY_SIDE: Record<PortSide, HandleType> = {
    left: "target",
    right: "source",
};

const HANDLE_POSITION_BY_SIDE: Record<PortSide, Position> = {
    left: Position.Left,
    right: Position.Right,
};

export function PortHandle({
    side,
    name,
    type,
    required = false,
    connectable = true,
}: {
    side: PortSide;
    name: string;
    type: string;
    required?: boolean;
    connectable?: boolean;
}): JSX.Element {
    return (
        <div
            className={cn(
                "relative flex h-6 items-center px-3 text-xs",
                side === "right" && "justify-end",
            )}
        >
            <Handle
                id={name}
                type={HANDLE_TYPE_BY_SIDE[side]}
                position={HANDLE_POSITION_BY_SIDE[side]}
                isConnectable={connectable}
                className={cn("port-handle", !required && "port-handle--optional")}
            />
            <Tooltip content={type}>
                <span className="truncate">{name}</span>
            </Tooltip>
        </div>
    );
}
