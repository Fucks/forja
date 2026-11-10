import { Handle, Position } from "@xyflow/react";
import type { HandleType } from "@xyflow/react";
import type { JSX } from "react";

import { type PortHint, usePortHint } from "@/web/canvas/connection_hints.js";
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

const PORT_HINT_CLASSES: Record<PortHint, string | undefined> = {
    compatible: "port-handle--compatible",
    incompatible: "port-handle--incompatible",
    none: undefined,
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
    const handleType = HANDLE_TYPE_BY_SIDE[side];
    const hint = usePortHint(name, handleType);

    return (
        <div
            className={cn(
                "relative flex h-6 items-center px-3 text-xs",
                side === "right" && "justify-end",
            )}
        >
            <Handle
                id={name}
                type={handleType}
                position={HANDLE_POSITION_BY_SIDE[side]}
                isConnectable={connectable}
                className={cn(
                    "port-handle",
                    !required && "port-handle--optional",
                    PORT_HINT_CLASSES[hint],
                )}
            />
            <Tooltip content={type}>
                <span className="truncate">{name}</span>
            </Tooltip>
        </div>
    );
}
