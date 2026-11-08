const ACCENT_MARKS = /\p{Diacritic}/gu;
const WORD_SEPARATORS = /\s+/g;
const SLUG_WORD_JOINER = "_";

// The name a node goes by in loop conditions ("Revisar" → `revisar.approved`).
export function nodeSlug(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(ACCENT_MARKS, "")
        .replace(WORD_SEPARATORS, SLUG_WORD_JOINER);
}
