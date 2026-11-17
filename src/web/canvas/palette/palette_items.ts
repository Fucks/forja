import type { LucideIcon } from "lucide-react";

import type { NodeType } from "@/shared/flow_graph.js";
import { GROUP_KIND_ICONS } from "@/web/canvas/base/group_frame.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import { GROUP_KINDS } from "@/web/canvas/grouping.js";
import type { GroupKind } from "@/web/canvas/grouping.js";
import type { DocumentedType, NodeCategory, NodeDoc } from "@/web/docs/node_docs/node_doc.js";
import {
    ALL_NODE_DOCS,
    CATEGORY_LABELS,
    getNodeDoc,
    NODE_CATEGORIES,
} from "@/web/docs/node_docs/node_docs.js";

export type PaletteItemRef = { kind: "node"; type: NodeType } | { kind: "group"; type: GroupKind };

export type PaletteItem = PaletteItemRef & {
    category: NodeCategory;
    label: string;
    description: string;
    icon: LucideIcon;
    singleton?: boolean;
};

export interface PaletteSection {
    category: NodeCategory;
    label: string;
    items: PaletteItem[];
}

const SINGLETON_NODE_TYPES: ReadonlySet<NodeType> = new Set(["trigger"]);

export const PALETTE_ITEMS: PaletteItem[] = ALL_NODE_DOCS.map(toPaletteItem);

export type NodePaletteItem = Extract<PaletteItem, { kind: "node" }>;

export function filterPaletteItems<Item extends PaletteItem>(items: Item[], query: string): Item[] {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) =>
        listSearchableTexts(item).some((text) => text.toLowerCase().includes(normalizedQuery)),
    );
}

export function listNodePaletteItems(types: NodeType[]): NodePaletteItem[] {
    return PALETTE_ITEMS.filter(isNodePaletteItem).filter((item) => types.includes(item.type));
}

export function groupPaletteItemsByCategory(items: PaletteItem[]): PaletteSection[] {
    return NODE_CATEGORIES.map((category) => ({
        category,
        label: CATEGORY_LABELS[category],
        items: items.filter((item) => item.category === category),
    })).filter((section) => section.items.length > 0);
}

function toPaletteItem(doc: NodeDoc): PaletteItem {
    const { type, category, title, tagline } = doc;
    const shownFields = { category, label: title, description: tagline };
    if (isGroupKind(type)) {
        return { kind: "group", type, icon: GROUP_KIND_ICONS[type], ...shownFields };
    }

    return {
        kind: "node",
        type,
        icon: NODE_TYPE_ICONS[type],
        singleton: SINGLETON_NODE_TYPES.has(type),
        ...shownFields,
    };
}

function isNodePaletteItem(item: PaletteItem): item is NodePaletteItem {
    return item.kind === "node";
}

function isGroupKind(type: DocumentedType): type is GroupKind {
    return GROUP_KINDS.some((kind) => kind === type);
}

function listSearchableTexts({ type, label, description }: PaletteItem): string[] {
    return [label, description, ...getNodeDoc(type).whenToUse];
}
