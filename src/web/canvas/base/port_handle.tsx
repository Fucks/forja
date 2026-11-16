import { Handle, Position } from "@xyflow/react";
import type { HandleType } from "@xyflow/react";
import type { JSX, ReactNode } from "react";

import type { PortType } from "@/shared/flow_graph.js";
import { PORT_TYPE_ICONS, PORT_TYPE_LABELS } from "@/web/canvas/base/port_type_icons.js";
import { type PortHint, usePortHint } from "@/web/canvas/connection_hints.js";
import { cn } from "@/web/components/ui/cn.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

type PortSide = "left" | "right";

export interface PortView {
    name: string;
    label: string;
    description?: string;
    type: PortType;
}

interface PortHandleProps extends PortView {
    side: PortSide;
    required?: boolean;
    connectable?: boolean;
    badge?: ReactNode;
}

const PORT_TYPE_ICON_SIZE_PX = 12;

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
    required = false,
    connectable = true,
    badge,
    ...port
}: PortHandleProps): JSX.Element {
    const handleType = HANDLE_TYPE_BY_SIDE[side];
    const hint = usePortHint(port.name, handleType);
    const TypeIcon = PORT_TYPE_ICONS[port.type];

    return (
        <div
            className={cn(
                "relative flex h-6 items-center gap-1 px-3 text-xs",
                side === "right" && "flex-row-reverse",
            )}
        >
            <Handle
                id={port.name}
                type={handleType}
                position={HANDLE_POSITION_BY_SIDE[side]}
                isConnectable={connectable}
                className={cn(
                    "port-handle",
                    !required && "port-handle--optional",
                    PORT_HINT_CLASSES[hint],
                )}
            />
            <TypeIcon
                size={PORT_TYPE_ICON_SIZE_PX}
                aria-hidden="true"
                className="shrink-0 text-steel"
            />
            <Tooltip content={<PortTooltip port={port} required={required} />}>
                <span className="max-w-[18ch] truncate">{port.label}</span>
            </Tooltip>
            {badge}
        </div>
    );
}

function PortTooltip({ port, required }: { port: PortView; required: boolean }): JSX.Element {
    const requirement = required ? "obrigatória" : "opcional";

    return (
        <div className="flex max-w-xs flex-col gap-1">
            <span className="font-medium">{port.label}</span>
            {port.description !== undefined && <span>{port.description}</span>}
            <span className="text-muted">
                <span className="font-mono">{port.name}</span> · {PORT_TYPE_LABELS[port.type]} ·{" "}
                {requirement}
            </span>
        </div>
    );
}
