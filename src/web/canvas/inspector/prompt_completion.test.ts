import type { VariableInfo } from "@/engine/prompt_template.js";
import { promptCompletions } from "@/web/canvas/inspector/prompt_completion.js";

const VARIABLES: VariableInfo[] = [
    { path: "inputs.spec", description: 'Entrada "spec"', type: "text" },
    { path: "item.title", description: "Título do item", type: "string" },
    { path: "item.body", description: "Descrição do item", type: "string" },
];

describe("promptCompletions", () => {
    it("suggests every variable right after {{", () => {
        const completions = promptCompletions(VARIABLES, "Implemente {{");

        expect(completions).toEqual({
            from: "Implemente {{".length,
            options: [
                { label: "inputs.spec", detail: 'text · Entrada "spec"' },
                { label: "item.title", detail: "string · Título do item" },
                { label: "item.body", detail: "string · Descrição do item" },
            ],
        });
    });

    it("keeps only the variables that start with the typed prefix", () => {
        const completions = promptCompletions(VARIABLES, "Resuma {{item.t");

        expect(completions?.options.map((option) => option.label)).toEqual(["item.title"]);
        expect(completions?.from).toBe("Resuma {{".length);
    });

    it("starts the completion after the spaces that follow {{", () => {
        const completions = promptCompletions(VARIABLES, "{{  inp");

        expect(completions?.from).toBe("{{  ".length);
        expect(completions?.options.map((option) => option.label)).toEqual(["inputs.spec"]);
    });

    it("does not activate outside a variable", () => {
        expect(promptCompletions(VARIABLES, "Implemente a issue")).toBeNull();
    });

    it("does not activate after a variable that is already closed", () => {
        expect(promptCompletions(VARIABLES, "{{item.title}} e ")).toBeNull();
    });

    it("does not activate after an escaped {{", () => {
        expect(promptCompletions(VARIABLES, "Use \\{{")).toBeNull();
    });

    it("does not activate when the text after {{ cannot be a variable path", () => {
        expect(promptCompletions(VARIABLES, "{{item title")).toBeNull();
    });
});
