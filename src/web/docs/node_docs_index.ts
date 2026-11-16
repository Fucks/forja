import type { NodeCategory, NodeDoc } from "@/web/docs/node_docs/node_doc.js";
import { CATEGORY_LABELS, NODE_CATEGORIES } from "@/web/docs/node_docs/node_docs.js";

export interface NodeDocsCategoryGroup {
    category: NodeCategory;
    label: string;
    docs: NodeDoc[];
}

export function groupNodeDocsByCategory(docs: NodeDoc[]): NodeDocsCategoryGroup[] {
    return NODE_CATEGORIES.map((category) => ({
        category,
        label: CATEGORY_LABELS[category],
        docs: docs.filter((doc) => doc.category === category),
    })).filter((group) => group.docs.length > 0);
}

export function searchNodeDocs(docs: NodeDoc[], query: string): NodeDoc[] {
    const normalizedQuery = query.trim().toLowerCase();

    return docs.filter((doc) =>
        listSearchableTexts(doc).some((text) => text.toLowerCase().includes(normalizedQuery)),
    );
}

function listSearchableTexts(doc: NodeDoc): string[] {
    return [doc.title, doc.tagline, ...doc.whenToUse];
}
