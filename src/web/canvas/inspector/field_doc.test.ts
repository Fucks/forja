import { GIT_ACTIONS } from "@/shared/node_configs/git_config.js";
import {
    fieldDoc,
    fieldOptionCards,
    UndocumentedFieldError,
} from "@/web/canvas/inspector/field_doc.js";

describe("fieldDoc", () => {
    it("finds the documentation of a node field by its config key", () => {
        const doc = fieldDoc("source", "limit");

        expect(doc.label).toBe("Máximo de itens");
    });

    it("finds the documentation of a group field", () => {
        expect(fieldDoc("map", "concurrency").label).toBe("Itens em paralelo");
    });

    it("refuses a key the documentation does not have", () => {
        expect(() => fieldDoc("source", "unknown")).toThrow(UndocumentedFieldError);
    });
});

describe("fieldOptionCards", () => {
    it("turns each value into a card with the documented label and description", () => {
        const cards = fieldOptionCards(fieldDoc("git", "action"), GIT_ACTIONS);

        expect(cards).toEqual([
            {
                value: "rebase",
                label: "Rebase",
                description: "Atualiza a branch com a base. Se houver conflito, um agente resolve.",
            },
            { value: "push", label: "Push", description: "Envia a branch para o GitHub." },
            { value: "open_pr", label: "Abrir PR", description: "Faz push e abre o PR." },
        ]);
    });

    it("refuses a value the documentation does not describe", () => {
        expect(() => fieldOptionCards(fieldDoc("git", "action"), ["merge"])).toThrow(
            UndocumentedFieldError,
        );
    });
});
