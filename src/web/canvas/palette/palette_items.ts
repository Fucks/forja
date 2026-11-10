import type { LucideIcon } from "lucide-react";

import type { NodeType } from "@/shared/flow_graph.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import { NODE_TYPE_LABELS } from "@/web/canvas/base/node_type_labels.js";

export interface PaletteItem {
    type: NodeType;
    label: string;
    description: string;
    icon: LucideIcon;
    singleton?: boolean;
}

export const PALETTE_ITEMS: PaletteItem[] = [
    paletteItem("trigger", "Início do fluxo (um por fluxo)", { singleton: true }),
    paletteItem("source", "Busca itens (GitHub ou locais)"),
    paletteItem("agent", "Prompt em contexto limpo no Claude Code"),
    paletteItem("script", "Comando no workspace do item (ex.: testes)"),
    paletteItem("condition", "Desvia por uma regra sobre os dados"),
    paletteItem("gate", "Espera aprovação humana"),
    paletteItem("git", "Rebase, push ou PR"),
    paletteItem("output", "Fim: move o item no board"),
];

export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter(({ label, description }) =>
        [label, description].some((text) => text.toLowerCase().includes(normalizedQuery)),
    );
}

function paletteItem(
    type: NodeType,
    description: string,
    options: { singleton?: boolean } = {},
): PaletteItem {
    return {
        type,
        label: NODE_TYPE_LABELS[type],
        description,
        icon: NODE_TYPE_ICONS[type],
        ...options,
    };
}
