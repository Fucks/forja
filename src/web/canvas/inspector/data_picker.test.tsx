import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Mock } from "vitest";

import { DataPicker } from "@/web/canvas/inspector/data_picker.js";
import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";

type PathSpy = Mock<(path: string) => void>;

interface RenderedPicker {
    onPick: PathSpy;
    onType: PathSpy;
}

const PICKER_LABEL = "Caminho da regra 1";
const LONG_NOTES = "Faltam testes para o caso de pedido vazio e para o limite de itens";

const FIELDS: PickableDataField[] = [
    { path: "item.title", label: "Item atual › title", type: "string", depth: 0 },
    {
        path: "nodes.reviewer.result",
        label: "Reviewer › Resultado",
        type: "object",
        sourceNodeId: "reviewer",
        depth: 0,
    },
    {
        path: "nodes.reviewer.result.approved",
        label: "Reviewer › Resultado › approved",
        type: "boolean",
        sourceNodeId: "reviewer",
        depth: 1,
        sampleText: "true",
    },
    {
        path: "nodes.reviewer.result.notes",
        label: "Reviewer › Resultado › notes",
        type: "string",
        sourceNodeId: "reviewer",
        depth: 1,
        sampleText: LONG_NOTES,
    },
    {
        path: "nodes.reviewer.result.kind",
        label: "Reviewer › Resultado › kind",
        type: "string",
        enumValues: ["bug", "feature"],
        sourceNodeId: "reviewer",
        depth: 1,
    },
    { path: "run.iteration", label: "Execução › iteration", type: "number", depth: 0 },
];

describe("DataPicker", () => {
    it("shows 'Escolher dado…' until a field is chosen", () => {
        renderPicker({ path: "" });

        expect(screen.getByRole("button", { name: PICKER_LABEL })).toHaveTextContent(
            "Escolher dado…",
        );
    });

    it("shows the label of the chosen field", () => {
        renderPicker({ path: "nodes.reviewer.result.approved" });

        expect(screen.getByRole("button", { name: PICKER_LABEL })).toHaveTextContent(
            "Reviewer › Resultado › approved",
        );
    });

    it("groups the fields by where they come from", async () => {
        renderPicker({ path: "" });

        await openPicker();

        const tree = screen.getByRole("tree");
        const groups = within(tree).getAllByRole("treeitem", { expanded: true });
        expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
            "Item atual",
            "Reviewer",
            "Execução",
        ]);
    });

    it("describes each field type in words, listing the options of an enum", async () => {
        renderPicker({ path: "" });

        await openPicker();

        expect(getFieldRow("Reviewer › Resultado › approved (sim/não)")).toBeInTheDocument();
        expect(getFieldRow("Reviewer › Resultado › notes (texto)")).toBeInTheDocument();
        expect(getFieldRow("Execução › iteration (número)")).toBeInTheDocument();
        expect(
            getFieldRow("Reviewer › Resultado › kind (opções: bug | feature)"),
        ).toBeInTheDocument();
    });

    it("shows the last run sample truncated to 40 characters", async () => {
        renderPicker({ path: "" });

        await openPicker();

        const notesRow = getFieldRow("Reviewer › Resultado › notes (texto)");
        expect(notesRow).toHaveTextContent(`${LONG_NOTES.slice(0, 40)}…`);
        expect(getFieldRow("Reviewer › Resultado › approved (sim/não)")).toHaveTextContent("true");
    });

    it("works the same without samples", async () => {
        const fieldsWithoutSamples = FIELDS.map(withoutSample);
        const picker = renderPicker({ path: "", fields: fieldsWithoutSamples });

        await openPicker();
        await userEvent.click(getFieldRow("Reviewer › Resultado › approved (sim/não)"));

        expect(picker.onPick).toHaveBeenCalledWith("nodes.reviewer.result.approved");
    });

    it("picks a field with a click and closes", async () => {
        const picker = renderPicker({ path: "" });

        await openPicker();
        await userEvent.click(getFieldRow("Item atual › title (texto)"));

        expect(picker.onPick).toHaveBeenCalledWith("item.title");
        expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    });

    it("filters the fields by the search, by label or by path", async () => {
        renderPicker({ path: "" });

        await openPicker();
        await userEvent.type(screen.getByRole("searchbox", { name: "Buscar dado" }), "APPRO");

        expect(screen.getAllByRole("treeitem", { name: /\(/ })).toEqual([
            getFieldRow("Reviewer › Resultado › approved (sim/não)"),
        ]);

        await userEvent.clear(screen.getByRole("searchbox", { name: "Buscar dado" }));
        await userEvent.type(screen.getByRole("searchbox", { name: "Buscar dado" }), "run.it");

        expect(screen.getAllByRole("treeitem", { name: /\(/ })).toEqual([
            getFieldRow("Execução › iteration (número)"),
        ]);
    });

    it("collapses a group", async () => {
        renderPicker({ path: "" });

        await openPicker();
        await userEvent.click(screen.getByRole("button", { name: "Reviewer" }));

        expect(screen.getByRole("treeitem", { name: "Reviewer" })).toHaveAttribute(
            "aria-expanded",
            "false",
        );
        expect(
            screen.queryByRole("treeitem", { name: /Resultado › notes/ }),
        ).not.toBeInTheDocument();
    });

    it("tells how to get data when there is none", async () => {
        renderPicker({ path: "", fields: [] });

        await openPicker();

        expect(
            screen.getByText(
                "Nenhum dado disponível: ligue este nó a outro ou coloque-o dentro de um Map",
            ),
        ).toBeInTheDocument();
    });
});

describe("DataPicker keyboard", () => {
    it("moves with the arrows and picks with Enter", async () => {
        const picker = renderPicker({ path: "" });

        await openPicker();
        await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}{Enter}");

        expect(picker.onPick).toHaveBeenCalledWith("nodes.reviewer.result.approved");
    });

    it("marks the field the arrows are on as selected", async () => {
        renderPicker({ path: "" });

        await openPicker();
        await userEvent.keyboard("{ArrowDown}");

        expect(getFieldRow("Reviewer › Resultado (objeto)")).toHaveAttribute(
            "aria-selected",
            "true",
        );
    });

    it("closes with Esc without picking", async () => {
        const picker = renderPicker({ path: "" });

        await openPicker();
        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("tree")).not.toBeInTheDocument();
        expect(picker.onPick).not.toHaveBeenCalled();
    });
});

describe("DataPicker typed path", () => {
    it("switches to a text field to type the path", async () => {
        const picker = renderPicker({ path: "" });

        await openPicker();
        await userEvent.click(screen.getByRole("button", { name: "Digitar caminho" }));
        await userEvent.type(screen.getByRole("textbox", { name: PICKER_LABEL }), "n");

        expect(picker.onType).toHaveBeenCalledWith("n");
    });

    it("warns that an unknown path only works if the data exists in the run", () => {
        renderPicker({ path: "nodes.reviewer.result.score" });

        expect(screen.getByRole("textbox", { name: PICKER_LABEL })).toHaveValue(
            "nodes.reviewer.result.score",
        );
        expect(
            screen.getByText(
                "Este caminho não aparece nos formatos conhecidos; ele só funciona se o dado existir na execução",
            ),
        ).toBeInTheDocument();
    });

    it("does not warn about a known path", () => {
        renderPicker({ path: "item.title" });

        expect(screen.queryByText(/não aparece nos formatos conhecidos/)).not.toBeInTheDocument();
    });

    it("goes back to the list", async () => {
        renderPicker({ path: "nodes.reviewer.result.score" });

        await userEvent.click(screen.getByRole("button", { name: "Escolher da lista" }));

        expect(screen.getByRole("tree")).toBeInTheDocument();
    });
});

function renderPicker({
    path,
    fields = FIELDS,
}: {
    path: string;
    fields?: PickableDataField[];
}): RenderedPicker {
    const onPick: PathSpy = vi.fn();
    const onType: PathSpy = vi.fn();
    render(
        <DataPicker
            label={PICKER_LABEL}
            path={path}
            fields={fields}
            onPick={onPick}
            onType={onType}
            onTypingDone={vi.fn()}
        />,
    );

    return { onPick, onType };
}

async function openPicker(): Promise<void> {
    await userEvent.click(screen.getByRole("button", { name: PICKER_LABEL }));
}

function getFieldRow(name: string): HTMLElement {
    return screen.getByRole("treeitem", { name });
}

function withoutSample(field: PickableDataField): PickableDataField {
    return { ...field, sampleText: undefined };
}
