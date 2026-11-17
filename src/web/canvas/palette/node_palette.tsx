import { ChevronDown, Search } from "lucide-react";
import { useId, useState } from "react";
import type { JSX, KeyboardEvent } from "react";

import type { FlowNode } from "@/shared/flow_graph.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { startDraggingPaletteItem } from "@/web/canvas/palette/node_type_drag.js";
import {
    filterPaletteItems,
    groupPaletteItemsByCategory,
    PALETTE_ITEMS,
} from "@/web/canvas/palette/palette_items.js";
import type {
    PaletteItem,
    PaletteItemRef,
    PaletteSection,
} from "@/web/canvas/palette/palette_items.js";
import { useAddNode } from "@/web/canvas/palette/use_add_node.js";
import { cn } from "@/web/components/ui/cn.js";
import { FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";
import { Input } from "@/web/components/ui/input.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

const ITEM_ICON_SIZE_PX = 16;
const SECTION_CHEVRON_SIZE_PX = 14;

const ENTRY_SELECTOR = "[data-palette-entry]";
const FOCUS_STEPS: Partial<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

export function NodePalette({ store }: { store: EditorStore }): JSX.Element {
    const [query, setQuery] = useState("");
    const nodes = store((state) => state.graph.nodes);
    const { addNodeAtViewportCenter, addGroupAtViewportCenter } = useAddNode(store);
    const sections = groupPaletteItemsByCategory(filterPaletteItems(PALETTE_ITEMS, query));

    function addAtViewportCenter(item: PaletteItemRef): void {
        if (item.kind === "group") {
            addGroupAtViewportCenter(item.type);
            return;
        }
        addNodeAtViewportCenter(item.type);
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
            <PaletteSearchField query={query} onQueryChange={setQuery} />
            {sections.length === 0 && (
                <p className="px-1 text-sm text-muted">Nenhum nó encontrado</p>
            )}
            <div
                className="flex min-h-0 flex-col gap-2 overflow-y-auto"
                onKeyDown={moveFocusBetweenEntries}
            >
                {sections.map((section) => (
                    <PaletteCategorySection
                        key={section.category}
                        section={section}
                        nodes={nodes}
                        onAdd={addAtViewportCenter}
                    />
                ))}
            </div>
        </div>
    );
}

function moveFocusBetweenEntries(event: KeyboardEvent<HTMLElement>): void {
    const step = FOCUS_STEPS[event.key];
    if (step === undefined) {
        return;
    }

    const entries = [...event.currentTarget.querySelectorAll<HTMLElement>(ENTRY_SELECTOR)];
    const focusedIndex = entries.findIndex((entry) => entry === document.activeElement);
    const nextEntry = entries[focusedIndex + step];
    if (focusedIndex === -1 || !nextEntry) {
        return;
    }

    event.preventDefault();
    nextEntry.focus();
}

function PaletteSearchField({
    query,
    onQueryChange,
}: {
    query: string;
    onQueryChange: (query: string) => void;
}): JSX.Element {
    return (
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
                onChange={(event) => onQueryChange(event.target.value)}
                className="pl-8"
            />
        </div>
    );
}

function PaletteCategorySection({
    section,
    nodes,
    onAdd,
}: {
    section: PaletteSection;
    nodes: FlowNode[];
    onAdd: (item: PaletteItemRef) => void;
}): JSX.Element {
    const labelId = useId();
    const listId = useId();
    const [isExpanded, setIsExpanded] = useState(true);
    const { label, items } = section;

    return (
        <section aria-labelledby={labelId}>
            <h3>
                <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={listId}
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={cn(
                        "flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-medium tracking-wide text-muted uppercase",
                        FOCUS_RING_CLASSES,
                    )}
                >
                    <ChevronDown
                        size={SECTION_CHEVRON_SIZE_PX}
                        aria-hidden="true"
                        className={cn("transition-transform", !isExpanded && "-rotate-90")}
                    />
                    <span id={labelId}>{label}</span>
                    <span className="ml-auto font-mono">{items.length}</span>
                </button>
            </h3>
            {isExpanded && (
                <ul id={listId} className="flex flex-col gap-1">
                    {items.map((item) => (
                        <li key={item.type}>
                            <PaletteEntry
                                item={item}
                                isUnavailable={isSingletonTaken(item, nodes)}
                                onAdd={onAdd}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </section>
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
    onAdd: (item: PaletteItemRef) => void;
}): JSX.Element {
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
        return entry;
    }

    return <Tooltip content={describeSingletonTaken(label)}>{entry}</Tooltip>;
}

function describeSingletonTaken(label: string): string {
    return `Este fluxo já tem um ${label.toLowerCase()}; só pode haver um por fluxo.`;
}
