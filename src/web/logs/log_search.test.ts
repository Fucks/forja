import { buildLogLine } from "@/test/factories/log_line_factory.js";
import {
    detailContainsQuery,
    findAdjacentMatch,
    findMatches,
    splitByQuery,
} from "@/web/logs/log_search.js";

const READ_TOOL_CALL = buildLogLine({
    seq: 2,
    kind: "tool_call",
    text: "Read",
    toolName: "Read",
    detail: "src/App.tsx",
});

const LINES = [
    buildLogLine({ seq: 1, kind: "system", text: "Iniciando container" }),
    READ_TOOL_CALL,
    buildLogLine({ seq: 3, text: "Lendo o arquivo app.tsx" }),
    buildLogLine({ seq: 4, kind: "error", text: "Falha ao compilar" }),
];

describe("findMatches", () => {
    it("finds lines regardless of letter case", () => {
        const matches = findMatches(LINES, "CONTAINER");

        expect(matches).toEqual([1]);
    });

    it("finds lines whose detail contains the query", () => {
        const matches = findMatches(LINES, "app.tsx");

        expect(matches).toEqual([2, 3]);
    });

    it("returns no matches for an empty query", () => {
        const matches = findMatches(LINES, "");

        expect(matches).toEqual([]);
    });

    it("returns no matches for a query made only of spaces", () => {
        const matches = findMatches(LINES, "   ");

        expect(matches).toEqual([]);
    });
});

describe("splitByQuery", () => {
    it("marks every occurrence of the query, keeping the original letter case", () => {
        const segments = splitByQuery("Erro: erro fatal", "ERRO");

        expect(segments).toEqual([
            { text: "Erro", isMatch: true },
            { text: ": ", isMatch: false },
            { text: "erro", isMatch: true },
            { text: " fatal", isMatch: false },
        ]);
    });

    it("returns the whole text unmarked for an empty query", () => {
        const segments = splitByQuery("Erro fatal", "");

        expect(segments).toEqual([{ text: "Erro fatal", isMatch: false }]);
    });
});

describe("detailContainsQuery", () => {
    it("detects the query in the detail of a line, regardless of letter case", () => {
        expect(detailContainsQuery(READ_TOOL_CALL, "APP")).toBe(true);
    });

    it("ignores matches that are only in the visible text", () => {
        expect(detailContainsQuery(READ_TOOL_CALL, "read")).toBe(false);
    });
});

describe("findAdjacentMatch", () => {
    const MATCH_SEQS = [3, 8, 15];

    it("starts at the first match when going forward with nothing selected", () => {
        expect(findAdjacentMatch(MATCH_SEQS, null, "next")).toBe(3);
    });

    it("starts at the last match when going backward with nothing selected", () => {
        expect(findAdjacentMatch(MATCH_SEQS, null, "previous")).toBe(15);
    });

    it("moves to the following match", () => {
        expect(findAdjacentMatch(MATCH_SEQS, 8, "next")).toBe(15);
    });

    it("wraps around to the first match after the last one", () => {
        expect(findAdjacentMatch(MATCH_SEQS, 15, "next")).toBe(3);
    });

    it("wraps around to the last match before the first one", () => {
        expect(findAdjacentMatch(MATCH_SEQS, 3, "previous")).toBe(15);
    });

    it("returns null when there are no matches", () => {
        expect(findAdjacentMatch([], null, "next")).toBeNull();
    });
});
