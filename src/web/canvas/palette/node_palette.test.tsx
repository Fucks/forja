import { ReactFlowProvider } from "@xyflow/react";
import { act, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

import type { FlowGraph } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { NodePalette } from "@/web/canvas/palette/node_palette.js";
import { EMPTY_GROUP_SIZE } from "@/web/canvas/grouping.js";
import { PALETTE_ITEMS } from "@/web/canvas/palette/palette_items.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

describe("NodePalette", () => {
    it.each(PALETTE_ITEMS.map((item) => item.type))(
        "lists the %s item with its title and tagline from the catalog",
        (type) => {
            renderPalette(createStoreWith(EMPTY_GRAPH));

            const { title, tagline } = getNodeDoc(type);

            expect(
                screen.getByRole("button", { name: title, description: tagline }),
            ).toBeInTheDocument();
        },
    );

    it("shows the categories in order, from Início to Grupos", () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        const sectionNames = screen.getAllByRole("region").map(readAccessibleName);

        expect(sectionNames).toEqual([
            "Início",
            "Buscar trabalho",
            "IA",
            "Executar",
            "Decidir",
            "Humano",
            "Entrega",
            "Fim",
            "Grupos",
        ]);
    });

    it("puts Map and Loop in the Grupos section", () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        const groupsSection = screen.getByRole("region", { name: "Grupos" });

        expect(listEntryNames(groupsSection)).toEqual(["Map", "Loop"]);
    });

    it("counts the items of each section", () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        const groupsHeader = screen.getByRole("button", { name: /^Grupos/, expanded: true });

        expect(groupsHeader).toHaveTextContent("Grupos2");
    });

    it("collapses and expands a section from its header", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));
        const groupsHeader = screen.getByRole("button", { name: /^Grupos/ });

        await userEvent.click(groupsHeader);
        expect(screen.queryByRole("button", { name: "Map" })).not.toBeInTheDocument();
        expect(groupsHeader).toHaveAttribute("aria-expanded", "false");

        await userEvent.click(groupsHeader);
        expect(screen.getByRole("button", { name: "Map" })).toBeInTheDocument();
    });

    it("names the decision, command and human approval nodes in plain words", () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        expect(screen.getByRole("button", { name: "Decisão" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Comando" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Aprovação humana" })).toBeInTheDocument();
    });

    it("lists one item per documented node and group", () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        expect(screen.getAllByRole("listitem")).toHaveLength(PALETTE_ITEMS.length);
    });

    it("creates the clicked node type in the draft and selects it", async () => {
        const store = createStoreWith(EMPTY_GRAPH);
        renderPalette(store);

        await userEvent.click(screen.getByRole("button", { name: "Agente" }));

        const { graph, selection, dirty } = store.getState();
        expect(graph.nodes.map((node) => node.type)).toEqual(["agent"]);
        expect(selection).toEqual([graph.nodes[0]?.id]);
        expect(dirty).toBe(true);
    });

    it("filters the items by name", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        await searchFor("GATILH");

        expect(listEntryNames(document.body)).toEqual(["Gatilho"]);
    });

    it("filters the items by description", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        await searchFor("branch");

        expect(listEntryNames(document.body)).toEqual(["Git"]);
    });

    it("finds the command node by what it is used for", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        await searchFor("testes");

        expect(listEntryNames(document.body)).toContain("Comando");
    });

    it("finds the human approval and the decision nodes by what they are used for", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        await searchFor("aprovar");

        expect(listEntryNames(document.body)).toEqual(
            expect.arrayContaining(["Aprovação humana", "Decisão"]),
        );
    });

    it("hides the sections without matches while searching", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        await searchFor("branch");

        expect(screen.getAllByRole("region").map(readAccessibleName)).toEqual(["Entrega"]);
    });

    it("tells when no item matches the search", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        await searchFor("xyz");

        expect(screen.getByText("Nenhum nó encontrado")).toBeInTheDocument();
    });

    it("disables the trigger item when the flow already has a trigger", async () => {
        const store = createStoreWith(GRAPH_WITH_TRIGGER);
        renderPalette(store);
        const triggerItem = screen.getByRole("button", { name: "Gatilho" });

        await userEvent.click(triggerItem);

        expect(triggerItem).toHaveAttribute("aria-disabled", "true");
        expect(triggerItem).toHaveAttribute("draggable", "false");
        expect(store.getState().graph.nodes).toHaveLength(1);
    });

    it("explains why the trigger item is disabled", async () => {
        renderPalette(createStoreWith(GRAPH_WITH_TRIGGER));

        await userEvent.hover(screen.getByRole("button", { name: "Gatilho" }));

        expect(await screen.findByRole("tooltip")).toHaveTextContent(/já tem um gatilho/);
    });

    it("keeps the trigger item enabled when the flow has no trigger", () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        expect(screen.getByRole("button", { name: "Gatilho" })).toHaveAttribute(
            "aria-disabled",
            "false",
        );
    });
});

describe("NodePalette keyboard", () => {
    it("moves between the entries with the arrow keys, across sections", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));
        act(() => screen.getByRole("button", { name: "Gatilho" }).focus());

        await userEvent.keyboard("{ArrowDown}");
        expect(screen.getByRole("button", { name: "Fonte" })).toHaveFocus();

        await userEvent.keyboard("{ArrowUp}");
        expect(screen.getByRole("button", { name: "Gatilho" })).toHaveFocus();
    });

    it("stays on the last entry when ArrowDown has nowhere to go", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));
        act(() => screen.getByRole("button", { name: "Loop" }).focus());

        await userEvent.keyboard("{ArrowDown}");

        expect(screen.getByRole("button", { name: "Loop" })).toHaveFocus();
    });

    it("adds the focused entry at the center with Enter", async () => {
        const store = createStoreWith(EMPTY_GRAPH);
        renderPalette(store);
        act(() => screen.getByRole("button", { name: "Comando" }).focus());

        await userEvent.keyboard("{Enter}");

        expect(store.getState().graph.nodes.map((node) => node.type)).toEqual(["script"]);
    });
});

describe("NodePalette detail card", () => {
    it("opens when an entry gets the keyboard focus, with the friendly port names", () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        act(() => screen.getByRole("button", { name: "Fonte" }).focus());

        const card = screen.getByRole("dialog", { name: "Detalhes de Fonte" });
        const { tagline, whatItDoes, ports } = getNodeDoc("source");
        expect(card).toHaveTextContent(tagline);
        expect(card).toHaveTextContent(whatItDoes);
        expect(within(card).getByRole("list", { name: "Entradas" })).toHaveTextContent(
            ports.inputs[0]?.label ?? "",
        );
        expect(within(card).getByRole("list", { name: "Saídas" })).toHaveTextContent(
            ports.outputs[0]?.label ?? "",
        );
    });

    it("shows the first example of the node", () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        act(() => screen.getByRole("button", { name: "Decisão" }).focus());

        const [firstExample] = getNodeDoc("condition").examples;
        expect(screen.getByRole("dialog")).toHaveTextContent(firstExample?.description ?? "");
    });

    it("opens a moment after the pointer rests on an entry", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        await userEvent.hover(screen.getByRole("button", { name: "Map" }));

        expect(await screen.findByRole("dialog", { name: "Detalhes de Map" })).toBeInTheDocument();
    });

    it("closes when the focus leaves the entry", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));
        act(() => screen.getByRole("button", { name: "Fonte" }).focus());

        await userEvent.click(screen.getByRole("searchbox", { name: "Buscar nós" }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it.each(["{Shift>}{F10}{/Shift}", "{ContextMenu}"])(
        "moves the focus into the card with %s",
        async (keys) => {
            renderPalette(createStoreWith(EMPTY_GRAPH));
            act(() => screen.getByRole("button", { name: "Agente" }).focus());

            await userEvent.keyboard(keys);

            expect(screen.getByRole("button", { name: "Documentação completa" })).toHaveFocus();
        },
    );

    it("closes with Escape and gives the focus back to the entry", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));
        const agentEntry = screen.getByRole("button", { name: "Agente" });
        act(() => agentEntry.focus());
        await userEvent.keyboard("{Shift>}{F10}{/Shift}");

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(agentEntry).toHaveFocus();
    });

    it("opens the full documentation of the type in the drawer", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));
        act(() => screen.getByRole("button", { name: "Loop" }).focus());

        await userEvent.click(screen.getByRole("button", { name: "Documentação completa" }));

        const drawer = screen.getByRole("dialog", { name: "Documentação do nó" });
        expect(drawer).toHaveTextContent(getNodeDoc("loop").whatItDoes);
        expect(screen.queryByRole("dialog", { name: "Detalhes de Loop" })).not.toBeInTheDocument();
    });

    it("keeps only the unavailable tooltip on a trigger the flow already has", () => {
        renderPalette(createStoreWith(GRAPH_WITH_TRIGGER));

        act(() => screen.getByRole("button", { name: "Gatilho" }).focus());

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});

describe("NodePalette groups", () => {
    it("adds an empty map at the center of the canvas and selects it", async () => {
        const store = createStoreWith(EMPTY_GRAPH);
        renderPalette(store);

        await userEvent.click(screen.getByRole("button", { name: "Map" }));

        const { graph, selection } = store.getState();
        expect(graph.groups).toHaveLength(1);
        expect(graph.groups[0]).toMatchObject({ kind: "map", size: EMPTY_GROUP_SIZE });
        expect(selection).toEqual([graph.groups[0]?.id]);
    });

    it("wraps the two selected nodes in the map", async () => {
        const store = createStoreWith(GRAPH_WITH_TWO_AGENTS);
        store.getState().select(["writer", "reviewer"]);
        renderPalette(store);

        await userEvent.click(screen.getByRole("button", { name: "Map" }));

        const { graph } = store.getState();
        const [map] = graph.groups;
        expect(map?.kind).toBe("map");
        expect(graph.nodes.map((node) => node.parentGroupId)).toEqual([map?.id, map?.id]);
    });

    it("adds an empty loop when the selection cannot be grouped", async () => {
        const store = createStoreWith(GRAPH_WITH_TRIGGER);
        store.getState().select(["trigger"]);
        renderPalette(store);

        await userEvent.click(screen.getByRole("button", { name: "Loop" }));

        const { graph } = store.getState();
        expect(graph.groups.map((group) => group.kind)).toEqual(["loop"]);
        expect(graph.nodes[0]?.parentGroupId).toBeUndefined();
    });
});

const EMPTY_GRAPH: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };

const GRAPH_WITH_TRIGGER: FlowGraph = {
    ...EMPTY_GRAPH,
    nodes: [createDefaultNode("trigger", "trigger", { x: 0, y: 0 })],
};

const GRAPH_WITH_TWO_AGENTS: FlowGraph = {
    ...EMPTY_GRAPH,
    nodes: [
        createDefaultNode("agent", "writer", { x: 0, y: 0 }),
        createDefaultNode("agent", "reviewer", { x: 300, y: 0 }),
    ],
};

function createStoreWith(graph: FlowGraph): EditorStore {
    const store = createEditorStore();
    store.getState().load({
        flowId: "flw_paleta",
        graph,
        revision: 1,
        updatedAt: "2026-11-10T12:00:00Z",
    });

    return store;
}

function renderPalette(store: EditorStore): void {
    render(
        <MemoryRouter>
            <ReactFlowProvider>
                <NodePalette store={store} />
            </ReactFlowProvider>
        </MemoryRouter>,
    );
}

async function searchFor(query: string): Promise<void> {
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar nós" }), query);
}

function listEntryNames(container: HTMLElement): string[] {
    return within(container)
        .queryAllByRole("listitem")
        .map((entry) => readAccessibleName(within(entry).getByRole("button")));
}

function readAccessibleName(element: HTMLElement): string {
    const labelId = element.getAttribute("aria-labelledby") ?? "";

    return document.getElementById(labelId)?.textContent ?? "";
}
