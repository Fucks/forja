import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Mock } from "vitest";

import type { Condition } from "@/shared/conditions.js";
import { ConditionEditor } from "@/web/canvas/inspector/condition_editor.js";
import { NUMBER_REQUIRED_ERROR } from "@/web/canvas/inspector/condition_rule_values.js";
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
const REVIEWER_APPROVED: PickableDataField = {
    path: "nodes.reviewer.result.approved",
    label: "Reviewer › Resultado › approved",
    type: "boolean",
    sourceNodeId: "reviewer",
    depth: 1,
};
const REVIEWER_STATE: PickableDataField = {
    path: "nodes.reviewer.result.state",
    label: "Reviewer › Resultado › state",
    type: "string",
    enumValues: ["approved", "rejected", "pending"],
    sourceNodeId: "reviewer",
    depth: 1,
};
const REVIEWER_LABELS: PickableDataField = {
    path: "nodes.reviewer.result.labels",
    label: "Reviewer › Resultado › labels",
    type: "list",
    sourceNodeId: "reviewer",
    depth: 1,
};
const REVIEWER_FIELDS = [REVIEWER_NOTES, REVIEWER_APPROVED, REVIEWER_STATE, REVIEWER_LABELS];

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

        await chooseOperator(1, "existe");

        expect(onChange).toHaveBeenLastCalledWith({ op: "exists", path: "review.approved" });
        expect(screen.queryByRole("textbox", { name: "Valor da regra 1" })).not.toBeInTheDocument();
    });

    it("refuses a greater-than rule without a number and keeps the condition", async () => {
        const onChange = renderConditionEditor(APPROVED);

        await chooseOperator(1, ">");

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

        expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ path: "nodes.reviewer.result.notes" }),
        );
        expect(getPathPicker(1)).toHaveTextContent("Reviewer › Resultado › notes");
    });

    it("reads the rule as a sentence above the rules, with the data in bold", () => {
        renderConditionEditor(
            { op: "eq", path: REVIEWER_APPROVED.path, value: true },
            REVIEWER_FIELDS,
        );

        const sentence = screen.getByLabelText("Regra em palavras");
        expect(sentence).toHaveTextContent(
            "Se Reviewer › Resultado › approved é verdadeiro → Sim · senão → Não",
        );
        expect(within(sentence).getByText("Reviewer › Resultado › approved").tagName).toBe(
            "STRONG",
        );
    });

    it("shows the technical text of the rule in the sentence's tooltip", async () => {
        renderConditionEditor(APPROVED);

        await userEvent.hover(screen.getByLabelText("Regra em palavras"));

        expect(await screen.findByRole("tooltip")).toHaveTextContent("review.approved = true");
    });

    it("offers only 'é verdadeiro' and 'é falso', without a value, for a yes/no field", async () => {
        const onChange = renderConditionEditor({ op: "exists", path: "" }, REVIEWER_FIELDS);

        await pickField(1, "Reviewer › Resultado › approved (sim/não)");
        await userEvent.click(getOperatorSelect(1));

        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
            "é verdadeiro",
            "é falso",
        ]);
        await userEvent.click(screen.getByRole("option", { name: "é falso" }));
        expect(onChange).toHaveBeenLastCalledWith({
            op: "eq",
            path: REVIEWER_APPROVED.path,
            value: false,
        });
        expect(within(getRule(1)).queryByLabelText("Valor da regra 1")).not.toBeInTheDocument();
    });

    it("chooses many options of an enum field with 'é um de'", async () => {
        const onChange = renderConditionEditor(
            { op: "eq", path: REVIEWER_STATE.path, value: "approved" },
            REVIEWER_FIELDS,
        );

        await chooseOperator(1, "é um de");
        const choices = within(getRule(1)).getByRole("group", { name: "Valor da regra 1" });
        await userEvent.click(within(choices).getByRole("checkbox", { name: "approved" }));
        await userEvent.click(within(choices).getByRole("checkbox", { name: "pending" }));

        expect(onChange).toHaveBeenLastCalledWith({
            op: "in",
            path: REVIEWER_STATE.path,
            values: ["approved", "pending"],
        });
    });

    it("keeps a number typed for a text field as text", async () => {
        const onChange = renderConditionEditor(
            { op: "eq", path: REVIEWER_NOTES.path, value: "ok" },
            REVIEWER_FIELDS,
        );

        const valueField = screen.getByRole("textbox", { name: "Valor da regra 1" });
        await userEvent.clear(valueField);
        await typeIntoField(valueField, "42");

        expect(onChange).toHaveBeenLastCalledWith({
            op: "eq",
            path: REVIEWER_NOTES.path,
            value: "42",
        });
    });

    it("resets the operator and the value that do not fit the new field", async () => {
        const onChange = renderConditionEditor(
            { op: "contains", path: REVIEWER_NOTES.path, value: "ok" },
            REVIEWER_FIELDS,
        );

        await pickField(1, "Reviewer › Resultado › approved (sim/não)");

        expect(onChange).toHaveBeenLastCalledWith({
            op: "eq",
            path: REVIEWER_APPROVED.path,
            value: true,
        });
        expect(getOperatorSelect(1)).toHaveTextContent("é verdadeiro");
        expect(within(getRule(1)).queryByLabelText("Valor da regra 1")).not.toBeInTheDocument();
    });

    it("keeps the operator and the value that still fit the new field", async () => {
        const onChange = renderConditionEditor(
            { op: "contains", path: REVIEWER_NOTES.path, value: "ok" },
            REVIEWER_FIELDS,
        );

        await pickField(1, "Reviewer › Resultado › labels (lista)");

        expect(onChange).toHaveBeenLastCalledWith({
            op: "contains",
            path: REVIEWER_LABELS.path,
            value: "ok",
        });
    });

    it("explains under the rule an operator that does not fit the field", () => {
        renderConditionEditor(
            { op: "contains", path: REVIEWER_APPROVED.path, value: "sim" },
            REVIEWER_FIELDS,
        );

        expect(within(getRule(1)).getByRole("alert")).toHaveTextContent(
            "‘contém’ não serve para sim/não. Escolha ‘é verdadeiro’ ou ‘é falso’.",
        );
    });

    it("opens a v1 decision on its input with the operators of the field's type", async () => {
        const v1Approved: PickableDataField = {
            path: "inputs.value.approved",
            label: "Entradas deste nó › O que passa adiante › approved",
            type: "boolean",
            sourceNodeId: "reviewer",
            depth: 1,
        };
        const onChange = renderConditionEditor(
            { op: "eq", path: "inputs.value.approved", value: true },
            [v1Approved],
        );

        expect(getPathPicker(1)).toHaveTextContent(v1Approved.label);
        expect(getOperatorSelect(1)).toHaveTextContent("é verdadeiro");
        await chooseOperator(1, "é falso");

        expect(onChange).toHaveBeenLastCalledWith({
            op: "eq",
            path: "inputs.value.approved",
            value: false,
        });
    });

    it("edits a v1 decision whose input has no known shape", async () => {
        const onChange = renderConditionEditor({
            op: "eq",
            path: "inputs.value.exitCode",
            value: 0,
        });

        expect(getOperatorSelect(1)).toHaveTextContent("=");
        const valueField = screen.getByRole("textbox", { name: "Valor da regra 1" });
        await userEvent.clear(valueField);
        await typeIntoField(valueField, "1");

        expect(onChange).toHaveBeenLastCalledWith({
            op: "eq",
            path: "inputs.value.exitCode",
            value: 1,
        });
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

function getOperatorSelect(ruleNumber: number): HTMLElement {
    return screen.getByRole("combobox", { name: `Operador da regra ${ruleNumber}` });
}

async function chooseOperator(ruleNumber: number, label: string): Promise<void> {
    await userEvent.click(getOperatorSelect(ruleNumber));
    await userEvent.click(screen.getByRole("option", { name: label }));
}

async function pickField(ruleNumber: number, treeItemName: string): Promise<void> {
    await userEvent.click(getPathPicker(ruleNumber));
    await userEvent.click(screen.getByRole("treeitem", { name: treeItemName }));
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
