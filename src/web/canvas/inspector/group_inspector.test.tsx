import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Mock } from "vitest";

import type { FlowGraph, FlowGroup } from "@/shared/flow_graph.js";
import { buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import { GroupInspector } from "@/web/canvas/inspector/group_inspector.js";

type GroupUpdate = (group: FlowGroup) => FlowGroup;
type GroupChangeSpy = Mock<(update: GroupUpdate) => void>;

const LOOP_FLOW = buildLoopFlow();

beforeEach(() => {
    localStorage.clear();
});

describe.each([
    { kind: "map", groupId: "items", title: "Map" },
    { kind: "loop", groupId: "review_loop", title: "Loop" },
])("GroupInspector header and tabs of a $kind", ({ groupId, title }) => {
    it("has the editable label, the documentation button and the ⓘ help", () => {
        renderGroupInspector(groupId);

        expect(screen.getByRole("textbox", { name: "Rótulo" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Documentação" })).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /^Ajuda sobre / }).length).toBeGreaterThan(0);
    });

    it("shows the group documentation in the Ajuda tab", async () => {
        renderGroupInspector(groupId);

        await userEvent.click(screen.getByRole("tab", { name: "Ajuda" }));

        const helpPanel = screen.getByRole("tabpanel", { name: "Ajuda" });
        expect(within(helpPanel).getByRole("heading", { name: title })).toBeInTheDocument();
    });
});

describe("GroupInspector Dados tab", () => {
    it("lists the port a loop's items leave through when it runs out of iterations", async () => {
        renderGroupInspector("review_loop");

        await userEvent.click(screen.getByRole("tab", { name: "Dados" }));

        expect(screen.getByRole("list", { name: "Saídas" })).toHaveTextContent("Esgotou as voltas");
    });
});

describe("GroupInspector of a map", () => {
    it("tells how many items run at the same time", () => {
        renderGroupInspector("items");

        expect(screen.getByText("até 2 itens ao mesmo tempo")).toBeInTheDocument();
    });

    it("raises the concurrency with the slider", async () => {
        const onChange = renderGroupInspector("items");

        screen.getByRole("slider", { name: "Itens em paralelo" }).focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(applyLastUpdate(onChange, "items").config).toMatchObject({ concurrency: 3 });
    });

    it("makes the map wait for every item", async () => {
        const onChange = renderGroupInspector("items");

        await userEvent.click(screen.getByRole("switch", { name: "Esperar todos" }));

        expect(applyLastUpdate(onChange, "items").config).toMatchObject({ barrier: true });
    });

    it("makes the map stop every item on the first failure", async () => {
        const onChange = renderGroupInspector("items");

        await userEvent.click(screen.getByRole("switch", { name: "Parar na primeira falha" }));

        expect(applyLastUpdate(onChange, "items").config).toMatchObject({ failFast: true });
    });

    it("renames the group", async () => {
        const onChange = renderGroupInspector("items");

        await userEvent.clear(screen.getByRole("textbox", { name: "Rótulo" }));
        await userEvent.type(screen.getByRole("textbox", { name: "Rótulo" }), "Por issue");
        await userEvent.tab();

        expect(applyLastUpdate(onChange, "items").label).toBe("Por issue");
    });
});

describe("GroupInspector of a loop", () => {
    it("applies an iteration cap within 1 and 50", async () => {
        const onChange = renderGroupInspector("review_loop");

        await replaceFieldText(screen.getByRole("spinbutton", { name: "Máximo de voltas" }), "8");

        expect(applyLastUpdate(onChange, "review_loop").config).toMatchObject({
            maxIterations: 8,
        });
    });

    it("refuses an iteration cap above 50", async () => {
        const onChange = renderGroupInspector("review_loop");

        await replaceFieldText(screen.getByRole("spinbutton", { name: "Máximo de voltas" }), "51");

        expect(screen.getByText("Use um número inteiro entre 1 e 50.")).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it("edits the condition that ends the loop", async () => {
        const onChange = renderGroupInspector("review_loop");

        await userEvent.click(screen.getByRole("radio", { name: "existe" }));

        expect(applyLastUpdate(onChange, "review_loop").config).toMatchObject({
            until: { op: "exists", path: "nodes.revisar.approved" },
        });
    });

    it("suggests the outputs of the nodes inside the loop", () => {
        renderGroupInspector("review_loop");

        const suggestions = screen.getAllByRole("option", { hidden: true });

        expect(suggestions.map((option) => option.getAttribute("value"))).toContain(
            "revisar.summary",
        );
    });

    it("carries an output port to the next iteration", async () => {
        const onChange = renderGroupInspector("review_loop");

        await userEvent.click(screen.getByRole("switch", { name: "Levar summary" }));

        expect(applyLastUpdate(onChange, "review_loop").config).toMatchObject({
            carry: ["notes", "summary"],
        });
    });

    it("stops carrying a port", async () => {
        const onChange = renderGroupInspector("review_loop");

        await userEvent.click(screen.getByRole("switch", { name: "Levar notes" }));

        expect(applyLastUpdate(onChange, "review_loop").config).toMatchObject({ carry: [] });
    });
});

function renderGroupInspector(groupId: string, graph: FlowGraph = LOOP_FLOW): GroupChangeSpy {
    const onChange: GroupChangeSpy = vi.fn();
    render(
        <MemoryRouter>
            <GroupInspector group={findGroupIn(graph, groupId)} graph={graph} onChange={onChange} />
        </MemoryRouter>,
    );

    return onChange;
}

function applyLastUpdate(onChange: GroupChangeSpy, groupId: string): FlowGroup {
    const lastCall = onChange.mock.lastCall;
    if (!lastCall) {
        throw new Error("The inspector did not change the group");
    }

    const [update] = lastCall;
    return update(findGroupIn(LOOP_FLOW, groupId));
}

function findGroupIn(graph: FlowGraph, groupId: string): FlowGroup {
    const group = graph.groups.find((candidate) => candidate.id === groupId);
    if (!group) {
        throw new Error(`Group ${groupId} not found`);
    }

    return group;
}

async function replaceFieldText(field: HTMLElement, text: string): Promise<void> {
    await userEvent.clear(field);
    await userEvent.type(field, text);
    await userEvent.tab();
}
