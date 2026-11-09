import { detailContainsQuery, findMatches, splitByQuery } from "@/web/logs/log_search.js";
import type { LogLine } from "@/web/logs/log_types.js";

const READ_TOOL_CALL: LogLine = {
    seq: 2,
    offsetMs: 500,
    kind: "tool_call",
    text: "Read",
    toolName: "Read",
    detail: "src/App.tsx",
};

const LINES: LogLine[] = [
    { seq: 1, offsetMs: 0, kind: "system", text: "Iniciando container" },
    READ_TOOL_CALL,
    { seq: 3, offsetMs: 900, kind: "text", text: "Lendo o arquivo app.tsx" },
    { seq: 4, offsetMs: 1_200, kind: "error", text: "Falha ao compilar" },
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
