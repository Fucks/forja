import type { LucideIcon } from "lucide-react";

import type { NodeType } from "@/shared/flow_graph.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import { NODE_TYPE_LABELS } from "@/web/canvas/base/node_type_labels.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

export interface PaletteItem {
    type: NodeType;
    label: string;
    description: string;
    icon: LucideIcon;
    singleton?: boolean;
}

export const PALETTE_ITEMS: PaletteItem[] = [
    paletteItem("trigger", { singleton: true }),
    paletteItem("source"),
    paletteItem("agent"),
    paletteItem("script"),
    paletteItem("condition"),
    paletteItem("gate"),
    paletteItem("git"),
    paletteItem("output"),
];

export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter(({ label, description }) =>
        [label, description].some((text) => text.toLowerCase().includes(normalizedQuery)),
    );
}

function paletteItem(type: NodeType, options: { singleton?: boolean } = {}): PaletteItem {
    return {
        type,
        label: NODE_TYPE_LABELS[type],
        description: getNodeDoc(type).tagline,
        icon: NODE_TYPE_ICONS[type],
        ...options,
    };
}
