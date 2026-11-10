import { Search } from "lucide-react";
import { useId, useState } from "react";
import type { JSX } from "react";

import type { FlowNode, NodeType } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { startDraggingNodeType } from "@/web/canvas/palette/node_type_drag.js";
import { PALETTE_ITEMS, filterPaletteItems } from "@/web/canvas/palette/palette_items.js";
import type { PaletteItem } from "@/web/canvas/palette/palette_items.js";
import { useAddNode } from "@/web/canvas/palette/use_add_node.js";
import { cn } from "@/web/components/ui/cn.js";
import { Input } from "@/web/components/ui/input.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

const ITEM_ICON_SIZE_PX = 16;

export function NodePalette({ store }: { store: EditorStore }): JSX.Element {
    const [query, setQuery] = useState("");
    const nodes = store((state) => state.graph.nodes);
    const { addNodeAtViewportCenter } = useAddNode(store);
    const visibleItems = filterPaletteItems(PALETTE_ITEMS, query);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
            <div className="relative">
                <Search
                    aria-hidden
                    className="pointer-events-none absolute top-2 left-2 size-4 text-muted"
                />
                <Input
                    type="search"
                    aria-label="Buscar nós"
                    placeholder="Buscar nós"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-8"
                />
            </div>
            {visibleItems.length === 0 && (
                <p className="px-1 text-sm text-muted">Nenhum nó encontrado</p>
            )}
            <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
                {visibleItems.map((item) => (
                    <li key={item.type}>
                        <PaletteEntry
                            item={item}
                            isUnavailable={isSingletonTaken(item, nodes)}
                            onAdd={addNodeAtViewportCenter}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function isSingletonTaken(item: PaletteItem, nodes: FlowNode[]): boolean {
    return item.singleton === true && nodes.some((node) => node.type === item.type);
}

function PaletteEntry({
    item,
    isUnavailable,
    onAdd,
}: {
    item: PaletteItem;
    isUnavailable: boolean;
    onAdd: (type: NodeType) => void;
}): JSX.Element {
    const labelId = useId();
    const descriptionId = useId();
    const { icon: Icon, type, label, description } = item;

    function addUnlessUnavailable(): void {
        if (!isUnavailable) {
            onAdd(type);
        }
    }

    // aria-disabled instead of disabled: a disabled button gets no pointer events, so the tooltip
    // that explains why it is unavailable would never open.
    const entry = (
        <button
            type="button"
            draggable={!isUnavailable}
            aria-disabled={isUnavailable}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            onDragStart={(event) => startDraggingNodeType(event, type)}
            onClick={addUnlessUnavailable}
            className={cn(
                "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left",
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
        return entry;
    }

    return <Tooltip content={describeSingletonTaken(label)}>{entry}</Tooltip>;
}

function describeSingletonTaken(label: string): string {
    return `Este fluxo já tem um ${label.toLowerCase()}; só pode haver um por fluxo.`;
}
