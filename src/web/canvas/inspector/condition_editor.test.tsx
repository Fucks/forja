import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Mock } from "vitest";

import type { Condition } from "@/shared/conditions.js";
import { ConditionEditor } from "@/web/canvas/inspector/condition_editor.js";
import { NUMBER_REQUIRED_ERROR } from "@/web/canvas/inspector/condition_rules.js";
import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";

type ConditionChangeSpy = Mock<(condition: Condition) => void>;

const APPROVED: Condition = { op: "eq", path: "review.approved", value: true };
const REVIEWER_NOTES: PickableDataField = {
    path: "nodes.reviewer.result.notes",
    label: "Reviewer › Resultado › notes",
    type: "string",
    sourceNodeId: "reviewer",
    depth: 1,
};

describe("ConditionEditor", () => {
    it("builds an 'and' of two rules", async () => {
        const onChange = renderConditionEditor(APPROVED);

        await userEvent.click(screen.getByRole("button", { name: "Adicionar regra" }));
        await typePath(2, "tests.exitCode");
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

    it("writes the exact path of the field picked for a rule", async () => {
        const onChange = renderConditionEditor({ op: "exists", path: "" }, [REVIEWER_NOTES]);

        await userEvent.click(getPathPicker(1));
        await userEvent.click(
            screen.getByRole("treeitem", { name: "Reviewer › Resultado › notes (texto)" }),
        );

        expect(onChange).toHaveBeenLastCalledWith({
            op: "exists",
            path: "nodes.reviewer.result.notes",
        });
        expect(getPathPicker(1)).toHaveTextContent("Reviewer › Resultado › notes");
    });

    it("shows a condition the rules cannot express as text, until it is restarted", async () => {
        renderConditionEditor({ op: "not", condition: APPROVED });

        expect(screen.getByText("NÃO (review.approved = true)")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Recomeçar como regras" }));

        expect(getPathPicker(1)).toHaveTextContent("Escolher dado…");
    });
});

function renderConditionEditor(
    value: Condition,
    fields: PickableDataField[] = [],
): ConditionChangeSpy {
    const onChange: ConditionChangeSpy = vi.fn();
    render(<ConditionEditor value={value} onChange={onChange} fields={fields} />);

    return onChange;
}

function getRule(ruleNumber: number): HTMLElement {
    return screen.getByRole("group", { name: `Regra ${ruleNumber}` });
}

function getPathPicker(ruleNumber: number): HTMLElement {
    return screen.getByRole("button", { name: `Caminho da regra ${ruleNumber}` });
}

async function typePath(ruleNumber: number, path: string): Promise<void> {
    await userEvent.click(getPathPicker(ruleNumber));
    await userEvent.click(screen.getByRole("button", { name: "Digitar caminho" }));
    await typeIntoField(
        screen.getByRole("textbox", { name: `Caminho da regra ${ruleNumber}` }),
        path,
    );
}

async function typeIntoField(field: HTMLElement, text: string): Promise<void> {
    await userEvent.type(field, text);
    await userEvent.tab();
}
