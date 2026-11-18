import { validationIssueSchema } from "@/shared/validation_issue.js";

describe("validationIssueSchema", () => {
    it("keeps how to fix the issue and the field it points to", () => {
        const issue = {
            level: "error",
            code: "empty_prompt",
            message: "O Agente ‘Dev’ não tem prompt.",
            fix: "Escreva o que o agente deve fazer na aba Configurar › Prompt.",
            fieldKey: "prompt",
            target: { kind: "node", id: "dev" },
        };

        expect(validationIssueSchema.parse(issue)).toEqual(issue);
    });

    it("accepts an issue without a fix or a field", () => {
        const issue = { level: "warning", code: "x", message: "Algo.", target: { kind: "flow" } };

        expect(validationIssueSchema.parse(issue)).toEqual(issue);
    });
});
