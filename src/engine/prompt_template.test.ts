import { parsePromptTemplate } from "@/engine/prompt_template.js";

describe("parsePromptTemplate", () => {
    it("splits text and variables with their positions in the template", () => {
        const tokens = parsePromptTemplate("Implemente {{item.title}} agora");

        expect(tokens).toEqual([
            { kind: "text", value: "Implemente ", start: 0, end: 11 },
            { kind: "var", value: "item.title", start: 11, end: 25 },
            { kind: "text", value: " agora", start: 25, end: 31 },
        ]);
    });

    it("accepts spaces around the variable path", () => {
        const tokens = parsePromptTemplate("{{  inputs.spec }}");

        expect(tokens).toEqual([{ kind: "var", value: "inputs.spec", start: 0, end: 18 }]);
    });

    it("keeps an escaped opening as literal text", () => {
        const tokens = parsePromptTemplate("a \\{{x}} b");

        expect(tokens).toEqual([{ kind: "text", value: "a {{x}} b", start: 0, end: 10 }]);
    });

    it("keeps an unclosed opening as literal text", () => {
        const tokens = parsePromptTemplate("faltou {{fechar");

        expect(tokens).toEqual([{ kind: "text", value: "faltou {{fechar", start: 0, end: 15 }]);
    });

    it("passes context commands through untouched", () => {
        const template = "Histórico: !`git log --oneline -5`";

        const tokens = parsePromptTemplate(template);

        expect(tokens).toEqual([{ kind: "text", value: template, start: 0, end: template.length }]);
    });

    it("returns no tokens for an empty template", () => {
        expect(parsePromptTemplate("")).toEqual([]);
    });
});
