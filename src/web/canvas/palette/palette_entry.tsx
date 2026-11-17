import { useId } from "react";
import type { JSX } from "react";

import type { FlowNode } from "@/shared/flow_graph.js";
import { startDraggingPaletteItem } from "@/web/canvas/palette/node_type_drag.js";
import type { PaletteItem, PaletteItemRef } from "@/web/canvas/palette/palette_items.js";
import { PaletteDetailAnchor } from "@/web/canvas/palette/palette_detail_anchor.js";
import { cn } from "@/web/components/ui/cn.js";
import { FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

const ITEM_ICON_SIZE_PX = 16;

export function PaletteEntry({
    item,
    nodes,
    onAdd,
}: {
    item: PaletteItem;
    nodes: FlowNode[];
    onAdd: (item: PaletteItemRef) => void;
}): JSX.Element {
    const isUnavailable = isSingletonTaken(item, nodes);
    const labelId = useId();
    const descriptionId = useId();
    const { icon: Icon, label, description } = item;

    function addUnlessUnavailable(): void {
        if (!isUnavailable) {
            onAdd(item);
        }
    }

    // aria-disabled instead of disabled: a disabled button gets no pointer events, so the tooltip
    // that explains why it is unavailable would never open.
    const entry = (
        <button
            type="button"
            data-palette-entry
            draggable={!isUnavailable}
            aria-disabled={isUnavailable}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            onDragStart={(event) => startDraggingPaletteItem(event, item)}
            onClick={addUnlessUnavailable}
            className={cn(
                "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left",
                FOCUS_RING_CLASSES,
                isUnavailable
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-grab hover:bg-surface-raised",
            )}
        >
            <Icon
                size={ITEM_ICON_SIZE_PX}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-steel"
            />
            <span className="flex min-w-0 flex-col">
                <span id={labelId} className="text-sm font-medium text-text">
                    {label}
                </span>
                <span id={descriptionId} className="text-xs text-muted">
                    {description}
                </span>
            </span>
        </button>
    );
    if (!isUnavailable) {
        return <PaletteDetailAnchor type={item.type}>{entry}</PaletteDetailAnchor>;
    }

    return <Tooltip content={describeSingletonTaken(label)}>{entry}</Tooltip>;
}

function isSingletonTaken(item: PaletteItem, nodes: FlowNode[]): boolean {
    return item.singleton === true && nodes.some((node) => node.type === item.type);
}

function describeSingletonTaken(label: string): string {
    return `Este fluxo já tem um ${label.toLowerCase()}; só pode haver um por fluxo.`;
}
