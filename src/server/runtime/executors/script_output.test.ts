import { parseScriptOutput } from "@/server/runtime/executors/script_output.js";

describe("parseScriptOutput", () => {
    it("reads nothing when the output is not parsed", () => {
        const parsing = parseScriptOutput('{"coverage": 81}', "none");

        expect(parsing).toEqual({ kind: "not_parsed" });
    });

    it("parses the whole stdout as JSON", () => {
        const parsing = parseScriptOutput('{\n  "coverage": 81\n}\n', "json");

        expect(parsing).toEqual({ kind: "parsed", data: { coverage: 81 } });
    });

    it("parses the last line that is not empty", () => {
        const parsing = parseScriptOutput('Rodando...\n{"coverage": 81}\n\n', "lastLineJson");

        expect(parsing).toEqual({ kind: "parsed", data: { coverage: 81 } });
    });

    it("tells when the output is not valid JSON", () => {
        const parsing = parseScriptOutput("Rodando...\n81%", "lastLineJson");

        expect(parsing).toEqual({ kind: "invalid" });
    });

    it("tells when there is no output to parse", () => {
        const parsing = parseScriptOutput("", "json");

        expect(parsing).toEqual({ kind: "invalid" });
    });
});
