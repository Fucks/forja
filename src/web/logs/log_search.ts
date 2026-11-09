import type { LogLine } from "@/web/logs/log_types.js";

export type MatchDirection = "next" | "previous";

const POSITION_STEP: Record<MatchDirection, number> = { next: 1, previous: -1 };

export interface TextSegment {
    text: string;
    isMatch: boolean;
}

export function findMatches(lines: LogLine[], query: string): number[] {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
        return [];
    }

    return lines.filter((line) => lineContains(line, normalizedQuery)).map((line) => line.seq);
}

export function findAdjacentMatch(
    matchSeqs: number[],
    selectedSeq: number | null,
    direction: MatchDirection,
): number | null {
    const selectedPosition = selectedSeq === null ? -1 : matchSeqs.indexOf(selectedSeq);
    if (selectedPosition === -1) {
        const startPosition = direction === "next" ? 0 : matchSeqs.length - 1;
        return matchSeqs[startPosition] ?? null;
    }

    const adjacentPosition =
        (selectedPosition + POSITION_STEP[direction] + matchSeqs.length) % matchSeqs.length;
    return matchSeqs[adjacentPosition] ?? null;
}

export function splitByQuery(text: string, query: string): TextSegment[] {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
        return [{ text, isMatch: false }];
    }

    const segments: TextSegment[] = [];
    const lowerCaseText = text.toLowerCase();
    let segmentStart = 0;
    let matchStart = lowerCaseText.indexOf(normalizedQuery);
    while (matchStart !== -1) {
        const matchEnd = matchStart + normalizedQuery.length;
        segments.push({ text: text.slice(segmentStart, matchStart), isMatch: false });
        segments.push({ text: text.slice(matchStart, matchEnd), isMatch: true });
        segmentStart = matchEnd;
        matchStart = lowerCaseText.indexOf(normalizedQuery, matchEnd);
    }
    segments.push({ text: text.slice(segmentStart), isMatch: false });

    return segments.filter((segment) => segment.text.length > 0);
}

export function detailContainsQuery(line: LogLine, query: string): boolean {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery || line.detail === undefined) {
        return false;
    }

    return line.detail.toLowerCase().includes(normalizedQuery);
}

function normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
}

function lineContains(line: LogLine, normalizedQuery: string): boolean {
    const searchableTexts = [line.text, line.detail ?? ""];
    return searchableTexts.some((text) => text.toLowerCase().includes(normalizedQuery));
}
