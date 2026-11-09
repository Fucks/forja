import { parseBlockedBy } from "@/integrations/github/blocked_by_parser.js";

describe("parseBlockedBy", () => {
    it("reads the issue numbers listed inline after 'Bloqueada por:'", () => {
        const body = "Contexto\n\nBloqueada por: #12, #15\n\nMais texto";

        expect(parseBlockedBy(body)).toEqual([12, 15]);
    });

    it("reads the issue numbers from the list the backlog script injects", () => {
        const body = [
            "## Dependências",
            "",
            "Bloqueada por:",
            "",
            "- #17 — Cadastrar projeto a partir de um repositório git local",
            "- #21 — Diagnóstico do host, veja também #3",
            "",
            "Só comece quando todas acima estiverem fechadas. Relacionada a #99.",
        ].join("\n");

        expect(parseBlockedBy(body)).toEqual([17, 21]);
    });

    it("accepts 'Blocked by:' and 'Depende de:' in any letter case", () => {
        const body = "blocked by: #1\nDEPENDE DE: #2, #3";

        expect(parseBlockedBy(body)).toEqual([1, 2, 3]);
    });

    it("accepts the label in bold markdown", () => {
        const body = "**Bloqueada por:** #8";

        expect(parseBlockedBy(body)).toEqual([8]);
    });

    it("reports each issue only once", () => {
        const body = "Bloqueada por: #4, #4\nDepende de: #4, #5";

        expect(parseBlockedBy(body)).toEqual([4, 5]);
    });

    it("handles Windows line endings", () => {
        const body = "Bloqueada por:\r\n- #6 — título\r\n- #7 — título\r\n";

        expect(parseBlockedBy(body)).toEqual([6, 7]);
    });

    it("ignores issue references outside a dependency line", () => {
        const body = "Veja #10 e #11 para contexto.";

        expect(parseBlockedBy(body)).toEqual([]);
    });

    it("returns nothing for an empty body", () => {
        expect(parseBlockedBy("")).toEqual([]);
    });
});
