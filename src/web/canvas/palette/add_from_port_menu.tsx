import { useRef, useState } from "react";
import type { JSX, KeyboardEvent } from "react";

import type { NodeType, Position } from "@/shared/flow_graph.js";
import { filterPaletteItems, listNodePaletteItems } from "@/web/canvas/palette/palette_items.js";
import type { NodePaletteItem } from "@/web/canvas/palette/palette_items.js";
import { useCloseOnOutsideInteraction } from "@/web/canvas/use_close_on_outside_interaction.js";
import { cn } from "@/web/components/ui/cn.js";
import { FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";
import { Input } from "@/web/components/ui/input.js";

const OPTION_ICON_SIZE_PX = 14;

export function AddFromPortMenu({
    screenPosition,
    nodeTypes,
    onChoose,
    onClose,
}: {
    screenPosition: Position;
    nodeTypes: NodeType[];
    onChoose: (type: NodeType) => void;
    onClose: () => void;
}): JSX.Element {
    const menuRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    useCloseOnOutsideInteraction(menuRef, onClose);
    const options = filterPaletteItems(listNodePaletteItems(nodeTypes), query);

    function chooseFirstOptionOnEnter(event: KeyboardEvent): void {
        const [firstOption] = options;
        if (event.key === "Enter" && firstOption) {
            onChoose(firstOption.type);
        }
    }

    return (
        <div
            ref={menuRef}
            role="dialog"
            aria-label="Adicionar nó ligado"
            style={{ left: screenPosition.x, top: screenPosition.y }}
            className="fixed z-50 flex w-64 flex-col gap-1 rounded-md border border-border bg-surface-raised p-1 shadow-float"
        >
            <Input
                type="search"
                aria-label="Buscar nós compatíveis"
                placeholder="Buscar nós compatíveis"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={chooseFirstOptionOnEnter}
            />
            {options.length === 0 && (
                <p className="px-2 py-1.5 text-sm text-muted">Nenhum nó compatível</p>
            )}
            <ul className="flex flex-col">
                {options.map((option) => (
                    <li key={option.type}>
                        <NodeOption option={option} onChoose={onChoose} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function NodeOption({
    option,
    onChoose,
}: {
    option: NodePaletteItem;
    onChoose: (type: NodeType) => void;
}): JSX.Element {
    const { icon: Icon, type, label } = option;

    return (
        <button
            type="button"
            onClick={() => onChoose(type)}
            className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-text hover:bg-surface",
                FOCUS_RING_CLASSES,
            )}
        >
            <Icon size={OPTION_ICON_SIZE_PX} aria-hidden="true" className="text-steel" />
            {label}
        </button>
    );
}
