import {
    parsePromptTemplate,
    type PromptContext,
    PromptRenderError,
    renderPrompt,
} from "@/engine/prompt_template.js";

function buildPromptContext(inputs: Record<string, unknown> = {}): PromptContext {
    return {
        inputs,
        item: { id: "wi_42", title: "Login com GitHub", body: "Descrição", number: 42, labels: [] },
        project: { name: "forja", baseBranch: "development" },
        run: { id: "run_1", iteration: 2, attempt: 1 },
    };
}

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

describe("renderPrompt", () => {
    it("replaces variables with values from the context", () => {
        const prompt = renderPrompt(
            "Implemente {{item.title}} a partir de {{ project.baseBranch }}",
            buildPromptContext(),
        );

        expect(prompt).toBe("Implemente Login com GitHub a partir de development");
    });

    it("inserts strings as they are", () => {
        const prompt = renderPrompt("{{inputs.spec}}", buildPromptContext({ spec: "  # Spec\n" }));

        expect(prompt).toBe("  # Spec\n");
    });

    it("inserts numbers and booleans as text", () => {
        const context = buildPromptContext({ approved: false });

        const prompt = renderPrompt("#{{item.number}} {{inputs.approved}}", context);

        expect(prompt).toBe("#42 false");
    });

    it("inserts objects and arrays as JSON indented with two spaces", () => {
        const context = buildPromptContext({ tests: { exitCode: 0 }, files: ["a.ts"] });

        const prompt = renderPrompt("{{inputs.tests}}\n{{inputs.files}}", context);

        expect(prompt).toBe('{\n  "exitCode": 0\n}\n[\n  "a.ts"\n]');
    });

    it("inserts null as null", () => {
        const prompt = renderPrompt("{{inputs.notes}}", buildPromptContext({ notes: null }));

        expect(prompt).toBe("null");
    });

    it("keeps escaped openings and context commands literal", () => {
        const prompt = renderPrompt("\\{{x}} !`git status`", buildPromptContext());

        expect(prompt).toBe("{{x}} !`git status`");
    });

    it("throws PromptRenderError naming a variable missing from the context", () => {
        const render = () => renderPrompt("Implemente {{item.nada}}", buildPromptContext());

        expect(render).toThrow(PromptRenderError);
        expect(render).toThrow("item.nada");
    });

    it("throws PromptRenderError for a variable whose value is undefined", () => {
        const context = buildPromptContext({ notes: undefined });

        const render = () => renderPrompt("{{inputs.notes}}", context);

        expect(render).toThrow(new PromptRenderError("inputs.notes"));
    });

    it("throws PromptRenderError for item variables when the run has no item", () => {
        const context = { ...buildPromptContext(), item: undefined };

        const render = () => renderPrompt("{{item.title}}", context);

        expect(render).toThrow(PromptRenderError);
    });
});
