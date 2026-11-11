import { ReactFlowProvider } from "@xyflow/react";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import type { FlowEdge, FlowGraph, FlowGroup, NodeType, Position } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { FlowCanvas } from "@/web/canvas/flow_canvas.js";
import { MIXED_GROUPS_REASON } from "@/web/canvas/grouping.js";
import { NODE_TYPE_DRAG_FORMAT } from "@/web/canvas/palette/node_type_drag.js";
import type { IssuesByTarget } from "@/web/canvas/use_validation.js";

const CANONICAL_FLOW = buildCanonicalFlow();
const EMPTY_FLOW: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };
const INVALID_MARKER_LABEL = "Configuração inválida";

const EMPTY_PROMPT_ERROR: ValidationIssue = {
    level: "error",
    code: "empty_prompt",
    message: 'O agente "Dev" está sem prompt.',
    target: { kind: "node", id: "dev" },
};
const GROUP_OVERLAP_ERROR: ValidationIssue = {
    level: "error",
    code: "group_overlap",
    message: 'O grupo "Desenvolver" se sobrepõe a outro grupo.',
    target: { kind: "group", id: "develop" },
};
const BACK_EDGE_WARNING: ValidationIssue = {
    level: "warning",
    code: "loop_without_back_edge",
    message: 'O loop "Dev" não tem aresta de volta entre seus nós.',
    target: { kind: "node", id: "dev" },
};

// ResizeObserver is mocked in src/test/setup.ts, so React Flow never measures the nodes and keeps
// them hidden: the nodes are found by their labels instead of by their accessible roles. For the
// same reason the viewport stays at the origin, unzoomed, so screen and flow positions match.
describe("FlowCanvas", () => {
    it.each(CANONICAL_FLOW.nodes.map((node) => node.label))(
        "renders the canonical flow's %s node",
        (label) => {
            renderCanvas(createStoreWith(CANONICAL_FLOW));

            expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
        },
    );

    it.each(CANONICAL_FLOW.groups.map((group) => group.label))(
        "renders the canonical flow's %s group",
        (label) => {
            renderCanvas(createStoreWith(CANONICAL_FLOW));

            expect(screen.getByLabelText(label)).toBeInTheDocument();
        },
    );

    it("labels each map group with its concurrency", () => {
        renderCanvas(createStoreWith(CANONICAL_FLOW));

        expect(screen.getByText("map ×3")).toBeInTheDocument();
    });

    it("does not mark the draft dirty just by opening it", () => {
        const store = createStoreWith(CANONICAL_FLOW);

        renderCanvas(store);

        expect(store.getState().dirty).toBe(false);
    });

    it("creates the dropped node type with its default ports at the drop position", () => {
        const store = createStoreWith(EMPTY_FLOW);
        renderCanvas(store);

        dropNodeType("agent", { x: 120, y: 80 });

        const [createdNode] = store.getState().graph.nodes;
        expect(createdNode).toEqual(
            createDefaultNode("agent", createdNode?.id ?? "", { x: 120, y: 80 }),
        );
        expect(store.getState().selection).toEqual([createdNode?.id]);
    });

    it("creates the dropped node inside the map under the cursor", () => {
        const store = createStoreWith(CANONICAL_FLOW);
        const developGroup = findCanonicalGroup("Desenvolver");
        renderCanvas(store);

        dropNodeType("script", centerOf(developGroup));

        expect(store.getState().graph.nodes.at(-1)?.parentGroupId).toBe(developGroup.id);
    });

    it("ignores a drop that does not carry a node type", () => {
        const store = createStoreWith(EMPTY_FLOW);
        renderCanvas(store);

        fireDragEvent("drop", { x: 0, y: 0 }, { "text/plain": "agent" });

        expect(store.getState().graph.nodes).toEqual([]);
    });

    it.each(["Delete", "Backspace"])(
        "removes the selected node and its edges when %s is pressed",
        async (key) => {
            const store = createStoreWith(CANONICAL_FLOW);
            store.getState().select(["dev"]);
            renderCanvas(store);

            fireEvent.keyDown(document, { key });

            await waitFor(() => expect(store.getState().selection).toEqual([]));
            const { nodes, edges } = store.getState().graph;
            expect(nodes.map((node) => node.id)).not.toContain("dev");
            expect(edges.some((edge) => isConnectedTo(edge, "dev"))).toBe(false);
        },
    );

    it("removes the selected edge when Delete is pressed", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        const [selectedEdge] = CANONICAL_FLOW.edges;
        store.getState().select([selectedEdge?.id ?? ""]);
        renderCanvas(store);

        fireEvent.keyDown(document, { key: "Delete" });

        await waitFor(() =>
            expect(store.getState().graph.edges).toEqual(CANONICAL_FLOW.edges.slice(1)),
        );
    });

    it("keeps a selected group and its nodes when Delete is pressed", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        const developGroup = findCanonicalGroup("Desenvolver");
        store.getState().select([developGroup.id, "trigger"]);
        renderCanvas(store);

        fireEvent.keyDown(document, { key: "Delete" });

        await waitFor(() => expect(store.getState().selection).toEqual([developGroup.id]));
        const { nodes, groups } = store.getState().graph;
        expect(groups).toEqual(CANONICAL_FLOW.groups);
        expect(nodes.map((node) => node.id)).toContain("dev");
    });

    it("outlines the group under the cursor while a node type is dragged over it", () => {
        const developGroup = findCanonicalGroup("Desenvolver");
        renderCanvas(createStoreWith(CANONICAL_FLOW));

        fireDragEvent("dragOver", centerOf(developGroup), {
            [NODE_TYPE_DRAG_FORMAT]: "script",
        });

        expect(screen.getByLabelText(developGroup.label)).toHaveClass("border-accent");
    });
});

function createStoreWith(graph: FlowGraph): EditorStore {
    const store = createEditorStore();
    store.getState().load({
        flowId: "flw_canonico",
        graph,
        revision: 1,
        updatedAt: "2026-11-09T12:00:00Z",
    });

    return store;
}

describe("FlowCanvas grouping", () => {
    it("hides the grouping actions while no node is selected", () => {
        renderCanvas(createStoreWith(CANONICAL_FLOW));

        expect(screen.queryByRole("button", { name: "Agrupar em map" })).not.toBeInTheDocument();
    });

    it("groups the selected node in a new map and selects the map", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        store.getState().select(["dev"]);
        renderCanvas(store);

        await userEvent.click(screen.getByRole("button", { name: "Agrupar em map" }));

        const { graph, selection } = store.getState();
        const newGroup = graph.groups.at(-1);
        expect(newGroup).toMatchObject({ kind: "map", parentGroupId: "develop" });
        expect(graph.nodes.find((node) => node.id === "dev")?.parentGroupId).toBe(newGroup?.id);
        expect(selection).toEqual([newGroup?.id]);
    });

    it("blocks grouping nodes of different groups", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        store.getState().select(["dev", "source"]);
        renderCanvas(store);
        const groupInMap = screen.getByRole("button", { name: "Agrupar em map" });

        await userEvent.click(groupInMap);

        expect(groupInMap).toHaveAttribute("aria-disabled", "true");
        expect(store.getState().graph.groups).toEqual(CANONICAL_FLOW.groups);
    });

    it("tells why the grouping is blocked", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        store.getState().select(["dev", "source"]);
        renderCanvas(store);

        screen.getByRole("button", { name: "Agrupar em map" }).focus();

        expect(
            await screen.findByRole("tooltip", { name: MIXED_GROUPS_REASON }),
        ).toBeInTheDocument();
    });

    it("groups the selected node in a loop with G then L", () => {
        const store = createStoreWith(CANONICAL_FLOW);
        store.getState().select(["source"]);
        renderCanvas(store);

        fireEvent.keyDown(document, { key: "g" });
        fireEvent.keyDown(document, { key: "l" });

        expect(store.getState().graph.groups.at(-1)).toMatchObject({ kind: "loop" });
    });

    it("ignores L when it does not follow G", () => {
        const store = createStoreWith(CANONICAL_FLOW);
        store.getState().select(["source"]);
        renderCanvas(store);

        fireEvent.keyDown(document, { key: "l" });

        expect(store.getState().graph.groups).toEqual(CANONICAL_FLOW.groups);
    });
});

describe("FlowCanvas group menu", () => {
    it("ungroups the group chosen in its context menu", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        renderCanvas(store);

        fireEvent.contextMenu(screen.getByLabelText("Desenvolver"));
        await userEvent.click(screen.getByRole("menuitem", { name: "Desagrupar" }));

        const { graph } = store.getState();
        expect(graph.groups.map((group) => group.id)).not.toContain("develop");
        expect(graph.nodes.find((node) => node.id === "dev")?.parentGroupId).toBeUndefined();
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("returns the nodes of a loop inside a map to the map when the loop is ungrouped", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        store.getState().select(["dev"]);
        renderCanvas(store);
        fireEvent.keyDown(document, { key: "g" });
        fireEvent.keyDown(document, { key: "l" });

        fireEvent.contextMenu(screen.getByLabelText("Loop"));
        await userEvent.click(screen.getByRole("menuitem", { name: "Desagrupar" }));

        const { graph } = store.getState();
        expect(graph.groups.some((group) => group.kind === "loop")).toBe(false);
        expect(graph.nodes.find((node) => node.id === "dev")?.parentGroupId).toBe("develop");
    });

    it("fits the group chosen in its context menu around its nodes", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        renderCanvas(store);

        fireEvent.contextMenu(screen.getByLabelText("Desenvolver"));
        await userEvent.click(screen.getByRole("menuitem", { name: "Ajustar ao conteúdo" }));

        const fittedGroup = store.getState().graph.groups.find((group) => group.id === "develop");
        expect(fittedGroup?.size).not.toEqual(findCanonicalGroup("Desenvolver").size);
    });

    it("marks a node with errors as invalid", () => {
        renderCanvas(createStoreWith(CANONICAL_FLOW), new Map([["dev", [EMPTY_PROMPT_ERROR]]]));

        expect(screen.getByLabelText(INVALID_MARKER_LABEL)).toBeInTheDocument();
    });

    it("lists the messages of an invalid node in the tooltip of its alert marker", async () => {
        const user = userEvent.setup();
        renderCanvas(
            createStoreWith(CANONICAL_FLOW),
            new Map([["dev", [EMPTY_PROMPT_ERROR, BACK_EDGE_WARNING]]]),
        );

        await user.hover(screen.getByLabelText(INVALID_MARKER_LABEL));

        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent(EMPTY_PROMPT_ERROR.message);
        expect(tooltip).toHaveTextContent(BACK_EDGE_WARNING.message);
    });

    it("does not mark a node that only has warnings", () => {
        renderCanvas(createStoreWith(CANONICAL_FLOW), new Map([["dev", [BACK_EDGE_WARNING]]]));

        expect(screen.queryByLabelText(INVALID_MARKER_LABEL)).not.toBeInTheDocument();
    });

    it("marks a group with errors as invalid", () => {
        renderCanvas(
            createStoreWith(CANONICAL_FLOW),
            new Map([["develop", [GROUP_OVERLAP_ERROR]]]),
        );

        const groupFrame = screen.getByRole("group", { name: "Desenvolver", hidden: true });
        expect(within(groupFrame).getByLabelText(INVALID_MARKER_LABEL)).toBeInTheDocument();
    });

    it("closes the context menu with Escape", async () => {
        renderCanvas(createStoreWith(CANONICAL_FLOW));
        fireEvent.contextMenu(screen.getByLabelText("Desenvolver"));

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
});

function renderCanvas(store: EditorStore, issuesByTarget: IssuesByTarget = new Map()): void {
    render(
        <ReactFlowProvider>
            <FlowCanvas store={store} issuesByTarget={issuesByTarget} />
        </ReactFlowProvider>,
    );
}

function isConnectedTo(edge: FlowEdge, nodeId: string): boolean {
    return edge.from.nodeId === nodeId || edge.to.nodeId === nodeId;
}

function findCanonicalGroup(label: string): FlowGroup {
    const group = CANONICAL_FLOW.groups.find((candidate) => candidate.label === label);
    if (!group) {
        throw new Error(`The canonical flow has no group labeled ${label}`);
    }

    return group;
}

function centerOf({ position, size }: FlowGroup): Position {
    return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
}

function dropNodeType(type: NodeType, point: Position): void {
    fireDragEvent("drop", point, { [NODE_TYPE_DRAG_FORMAT]: type });
}

// jsdom has no DragEvent, so the event it builds drops clientX/clientY; they are set by hand.
function fireDragEvent(
    kind: "dragOver" | "drop",
    point: Position,
    payload: Record<string, string>,
): void {
    const canvas = screen.getByTestId("rf__wrapper");
    const event = createEvent[kind](canvas, { dataTransfer: buildDataTransfer(payload) });
    Object.defineProperties(event, { clientX: { value: point.x }, clientY: { value: point.y } });

    fireEvent(canvas, event);
}

function buildDataTransfer(payload: Record<string, string>): Partial<DataTransfer> {
    return {
        types: Object.keys(payload),
        getData: (format) => payload[format] ?? "",
        dropEffect: "none",
    };
}
