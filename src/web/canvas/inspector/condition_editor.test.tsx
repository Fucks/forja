import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Mock } from "vitest";

import type { Condition } from "@/shared/conditions.js";
import { ConditionEditor } from "@/web/canvas/inspector/condition_editor.js";
import { NUMBER_REQUIRED_ERROR } from "@/web/canvas/inspector/condition_rules.js";

type ConditionChangeSpy = Mock<(condition: Condition) => void>;

const APPROVED: Condition = { op: "eq", path: "review.approved", value: true };

describe("ConditionEditor", () => {
    it("builds an 'and' of two rules", async () => {
        const onChange = renderConditionEditor(APPROVED);

        await userEvent.click(screen.getByRole("button", { name: "Adicionar regra" }));
        await typeIntoField(getPathField(2), "tests.exitCode");
        await typeIntoField(screen.getByRole("textbox", { name: "Valor da regra 2" }), "0");

        expect(onChange).toHaveBeenLastCalledWith({
            op: "and",
            conditions: [APPROVED, { op: "eq", path: "tests.exitCode", value: 0 }],
        });
    });

    it("joins the rules with 'or' when OU is chosen", async () => {
        const onChange = renderConditionEditor({
            op: "and",
            conditions: [APPROVED, { op: "exists", path: "tests.result" }],
        });

        await userEvent.click(screen.getByRole("radio", { name: "OU" }));

        expect(onChange).toHaveBeenLastCalledWith({
            op: "or",
            conditions: [APPROVED, { op: "exists", path: "tests.result" }],
        });
    });

    it("hides the value when the operator is 'existe'", async () => {
        const onChange = renderConditionEditor(APPROVED);

        await userEvent.click(within(getRule(1)).getByRole("radio", { name: "existe" }));

        expect(onChange).toHaveBeenLastCalledWith({ op: "exists", path: "review.approved" });
        expect(screen.queryByRole("textbox", { name: "Valor da regra 1" })).not.toBeInTheDocument();
    });

    it("refuses a greater-than rule without a number and keeps the condition", async () => {
        const onChange = renderConditionEditor(APPROVED);

        await userEvent.click(within(getRule(1)).getByRole("radio", { name: ">" }));

        expect(screen.getByRole("alert")).toHaveTextContent(NUMBER_REQUIRED_ERROR);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("removes a rule and keeps the remaining one as the condition", async () => {
        const onChange = renderConditionEditor({
            op: "and",
            conditions: [APPROVED, { op: "exists", path: "tests.result" }],
        });

        await userEvent.click(screen.getByRole("button", { name: "Remover regra 2" }));

        expect(onChange).toHaveBeenLastCalledWith(APPROVED);
    });

    it("suggests the known paths for each rule", () => {
        renderConditionEditor(APPROVED, ["tl.summary", "fonte.items"]);

        const suggestions = screen.getAllByRole("option", { hidden: true });

        expect(suggestions.map((option) => option.getAttribute("value"))).toEqual([
            "tl.summary",
            "fonte.items",
        ]);
    });

    it("shows a condition the rules cannot express as text, until it is restarted", async () => {
        renderConditionEditor({ op: "not", condition: APPROVED });

        expect(screen.getByText("NÃO (review.approved = true)")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Recomeçar como regras" }));

        expect(getPathField(1)).toHaveValue("");
    });
});

function renderConditionEditor(value: Condition, suggestions: string[] = []): ConditionChangeSpy {
    const onChange: ConditionChangeSpy = vi.fn();
    render(<ConditionEditor value={value} onChange={onChange} suggestions={suggestions} />);

    return onChange;
}

function getRule(ruleNumber: number): HTMLElement {
    return screen.getByRole("group", { name: `Regra ${ruleNumber}` });
}

// The path field offers suggestions, so it is a combobox rather than a plain textbox.
function getPathField(ruleNumber: number): HTMLElement {
    return screen.getByRole("combobox", { name: `Caminho da regra ${ruleNumber}` });
}

async function typeIntoField(field: HTMLElement, text: string): Promise<void> {
    await userEvent.type(field, text);
    await userEvent.tab();
}
