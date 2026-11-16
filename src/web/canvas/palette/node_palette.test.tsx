import { ReactFlowProvider } from "@xyflow/react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { NODE_TYPES } from "@/shared/flow_graph.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { NodePalette } from "@/web/canvas/palette/node_palette.js";
import { PALETTE_ITEMS } from "@/web/canvas/palette/palette_items.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

describe("NodePalette", () => {
    it.each(NODE_TYPES)("lists the %s node with its title and tagline from the catalog", (type) => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        const { title, tagline } = getNodeDoc(type);

        expect(
            screen.getByRole("button", { name: title, description: tagline }),
        ).toBeInTheDocument();
    });

    it("names the decision, command and human approval nodes in plain words", () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        expect(screen.getByRole("button", { name: "Decisão" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Comando" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Aprovação humana" })).toBeInTheDocument();
    });

    it("lists one item per node type", () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        expect(screen.getAllByRole("button")).toHaveLength(PALETTE_ITEMS.length);
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

        await userEvent.type(screen.getByRole("searchbox", { name: "Buscar nós" }), "AGEN");

        expect(screen.getAllByRole("button")).toEqual([
            screen.getByRole("button", { name: "Agente" }),
        ]);
    });

    it("filters the items by description", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        await userEvent.type(screen.getByRole("searchbox", { name: "Buscar nós" }), "branch");

        expect(screen.getAllByRole("button")).toEqual([
            screen.getByRole("button", { name: "Git" }),
        ]);
    });

    it("tells when no item matches the search", async () => {
        renderPalette(createStoreWith(EMPTY_GRAPH));

        await userEvent.type(screen.getByRole("searchbox", { name: "Buscar nós" }), "xyz");

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

const EMPTY_GRAPH: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };

const GRAPH_WITH_TRIGGER: FlowGraph = {
    ...EMPTY_GRAPH,
    nodes: [createDefaultNode("trigger", "trigger", { x: 0, y: 0 })],
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
        <ReactFlowProvider>
            <NodePalette store={store} />
        </ReactFlowProvider>,
    );
}
