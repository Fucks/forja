import { Position as HandlePosition, ReactFlowProvider } from "@xyflow/react";
import type {
    FinalConnectionState,
    Handle,
    HandleType,
    InternalNode,
    OnConnectEnd,
} from "@xyflow/react";
import type * as ReactFlowModule from "@xyflow/react";
import type { ComponentProps, JSX } from "react";
import {
    act,
    createEvent,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import type { FlowEdge, FlowGraph, FlowGroup, NodeType, Position } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { createEditorStore, HISTORY_MERGE_WINDOW_MS } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { FlowCanvas, markFlowingEdges } from "@/web/canvas/flow_canvas.js";
import { toReactFlow } from "@/web/canvas/graph_mapping.js";
import { MIXED_GROUPS_REASON } from "@/web/canvas/grouping.js";
import {
    GROUP_KIND_DRAG_FORMAT,
    NODE_TYPE_DRAG_FORMAT,
} from "@/web/canvas/palette/node_type_drag.js";
import { SHORTCUTS } from "@/web/canvas/shortcuts.js";
import {
    DUPLICATE_OFFSET_PX,
    TRIGGER_NOT_PASTED_NOTICE,
} from "@/web/canvas/use_canvas_clipboard.js";
import type { IssuesByTarget } from "@/web/canvas/use_validation.js";
import { ToastProvider } from "@/web/components/ui/toast.js";

// jsdom never measures the handles, so React Flow cannot start a connection drag; the canvas's
// onConnectEnd is recorded to be called the way React Flow calls it when a connection is let go.
const recordedReactFlow = vi.hoisted(() => ({
    onConnectEnd: undefined as OnConnectEnd | undefined,
}));

vi.mock("@xyflow/react", async (importOriginal) => {
    const reactFlow = await importOriginal<typeof ReactFlowModule>();
    function RecordingReactFlow(props: ComponentProps<typeof reactFlow.ReactFlow>): JSX.Element {
        recordedReactFlow.onConnectEnd = props.onConnectEnd;
        return <reactFlow.ReactFlow {...props} />;
    }

    return { ...reactFlow, ReactFlow: RecordingReactFlow };
});

const CANONICAL_FLOW = buildCanonicalFlow();
const EMPTY_FLOW: FlowGraph = { schemaVersion: 2, nodes: [], edges: [], groups: [] };
const INVALID_MARKER_LABEL = "Configuração inválida";

const EMPTY_PROMPT_ERROR: ValidationIssue = {
    level: "error",
    code: "empty_prompt",
    message: "O Agente ‘Dev’ não tem prompt.",
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

    it("creates an empty map where the dragged Map is dropped", () => {
        const store = createStoreWith(EMPTY_FLOW);
        renderCanvas(store);

        fireDragEvent("drop", { x: 40, y: 60 }, { [GROUP_KIND_DRAG_FORMAT]: "map" });

        const { graph, selection } = store.getState();
        expect(graph.groups).toEqual([
            expect.objectContaining({ kind: "map", position: { x: 40, y: 60 } }),
        ]);
        expect(graph.nodes).toEqual([]);
        expect(selection).toEqual([graph.groups[0]?.id]);
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

function createStoreWith(graph: FlowGraph, clock: FakeClock = new FakeClock()): EditorStore {
    const store = createEditorStore(clock);
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

describe("FlowCanvas add from port", () => {
    it("offers only the nodes that accept a list when an items edge is let go on empty space", () => {
        renderCanvas(createStoreWith(FLOW_WITH_SOURCE_AND_WRITER));

        letGoOnEmptySpace(["source", "items"], "source", EMPTY_SPOT);

        const menu = screen.getByRole("dialog", { name: "Adicionar nó ligado" });
        expect(
            within(menu)
                .getAllByRole("button")
                .map((option) => option.textContent),
        ).toEqual(["Fonte"]);
    });

    it("creates the chosen node at the drop point, linked from the dragged output", async () => {
        const store = createStoreWith(FLOW_WITH_SOURCE_AND_WRITER);
        renderCanvas(store);
        letGoOnEmptySpace(["writer", "summary"], "source", EMPTY_SPOT);

        await userEvent.click(screen.getByRole("button", { name: "Git" }));

        const { graph, selection } = store.getState();
        const createdNode = graph.nodes.at(-1);
        expect(createdNode).toMatchObject({ type: "git", position: EMPTY_SPOT });
        expect(graph.edges.map(({ from, to }) => ({ from, to }))).toEqual([
            {
                from: { nodeId: "writer", port: "summary" },
                to: { nodeId: createdNode?.id, port: "body" },
            },
        ]);
        expect(selection).toEqual([createdNode?.id]);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("links the new node's output to an input dragged to empty space", async () => {
        const store = createStoreWith(FLOW_WITH_SOURCE_AND_WRITER);
        renderCanvas(store);
        letGoOnEmptySpace(["writer", "item"], "target", EMPTY_SPOT);

        await userEvent.click(screen.getByRole("button", { name: "Aprovação humana" }));

        const createdNode = store.getState().graph.nodes.at(-1);
        expect(store.getState().graph.edges.map(({ from, to }) => ({ from, to }))).toEqual([
            {
                from: { nodeId: createdNode?.id, port: "approved" },
                to: { nodeId: "writer", port: "item" },
            },
        ]);
    });

    it("filters the offered nodes with the search", async () => {
        renderCanvas(createStoreWith(FLOW_WITH_SOURCE_AND_WRITER));
        letGoOnEmptySpace(["writer", "summary"], "source", EMPTY_SPOT);

        await userEvent.keyboard("branch");

        const menu = screen.getByRole("dialog", { name: "Adicionar nó ligado" });
        expect(
            within(menu)
                .getAllByRole("button")
                .map((option) => option.textContent),
        ).toEqual(["Git"]);
    });

    it("closes the menu with Escape without creating anything", async () => {
        const store = createStoreWith(FLOW_WITH_SOURCE_AND_WRITER);
        renderCanvas(store);
        letGoOnEmptySpace(["source", "items"], "source", EMPTY_SPOT);

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(store.getState().graph).toEqual(FLOW_WITH_SOURCE_AND_WRITER);
    });

    it("undoes the created node and its edge in a single step", async () => {
        const store = createStoreWith(FLOW_WITH_SOURCE_AND_WRITER);
        renderCanvas(store);
        letGoOnEmptySpace(["writer", "summary"], "source", EMPTY_SPOT);
        await userEvent.click(screen.getByRole("button", { name: "Git" }));

        fireEvent.keyDown(document, { key: "z", ctrlKey: true });

        expect(store.getState().graph).toEqual(FLOW_WITH_SOURCE_AND_WRITER);
    });

    it("keeps the menu closed when the connection is let go over a port", () => {
        renderCanvas(createStoreWith(FLOW_WITH_SOURCE_AND_WRITER));

        letGoOverPort(["source", "items"], ["writer", "item"]);

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});

describe("FlowCanvas history", () => {
    it("undoes and redoes creating and deleting a node in order", async () => {
        const clock = new FakeClock();
        const store = createStoreWith(EMPTY_FLOW, clock);
        renderCanvas(store);
        dropNodeType("agent", { x: 0, y: 0 });
        clock.advance(HISTORY_MERGE_WINDOW_MS + 1);
        fireEvent.keyDown(document, { key: "Delete" });
        await waitFor(() => expect(store.getState().graph.nodes).toEqual([]));

        fireEvent.keyDown(document, { key: "z", ctrlKey: true });
        const nodesAfterFirstUndo = store.getState().graph.nodes;
        fireEvent.keyDown(document, { key: "z", ctrlKey: true });
        const nodesAfterSecondUndo = store.getState().graph.nodes;
        fireEvent.keyDown(document, { key: "z", ctrlKey: true, shiftKey: true });

        expect(nodesAfterFirstUndo).toHaveLength(1);
        expect(nodesAfterSecondUndo).toEqual([]);
        expect(store.getState().graph.nodes).toHaveLength(1);
    });

    it("undoes and redoes with the toolbar buttons", async () => {
        const store = createStoreWith(EMPTY_FLOW);
        renderCanvas(store);
        dropNodeType("agent", { x: 0, y: 0 });

        await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
        const nodesAfterUndo = store.getState().graph.nodes;
        await userEvent.click(screen.getByRole("button", { name: "Refazer" }));

        expect(nodesAfterUndo).toEqual([]);
        expect(store.getState().graph.nodes).toHaveLength(1);
    });

    it("disables undo and redo while there is nothing to undo or redo", () => {
        renderCanvas(createStoreWith(CANONICAL_FLOW));

        expect(screen.getByRole("button", { name: "Desfazer" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Refazer" })).toBeDisabled();
    });

    it("leaves Ctrl+Z typed in the prompt editor to the text", () => {
        const store = createStoreWith(EMPTY_FLOW);
        renderCanvas(store);
        dropNodeType("agent", { x: 0, y: 0 });
        const promptEditor = appendPromptEditor();

        fireEvent.keyDown(promptEditor, { key: "z", ctrlKey: true });

        expect(store.getState().graph.nodes).toHaveLength(1);
        promptEditor.remove();
    });

    it("arranges the flow with Organizar and undoes the arrangement", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        renderCanvas(store);

        await userEvent.click(screen.getByRole("button", { name: "Organizar" }));
        await waitFor(() => expect(store.getState().graph).not.toEqual(CANONICAL_FLOW));
        await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));

        expect(store.getState().graph).toEqual(CANONICAL_FLOW);
    });
});

describe("FlowCanvas clipboard", () => {
    it("pastes a copied map with its nodes under new ids, keeping the edges inside it", () => {
        const store = createStoreWith(CANONICAL_FLOW);
        store.getState().select(["review_and_open_pr"]);
        renderCanvas(store);
        const clipboard = createClipboard();

        fireEvent.copy(document, { clipboardData: clipboard });
        fireEvent.paste(document, { clipboardData: clipboard });

        const { graph, selection } = store.getState();
        const pastedGroup = graph.groups.find((group) => group.id === selection[0]);
        const pastedNodes = graph.nodes.filter((node) => node.parentGroupId === pastedGroup?.id);
        const pastedNodeIds = new Set(pastedNodes.map((node) => node.id));
        expect(pastedGroup).toMatchObject({ kind: "map", label: "Revisar e abrir PR" });
        expect(pastedNodes.map((node) => node.label)).toEqual(
            CANONICAL_FLOW.nodes
                .filter((node) => node.parentGroupId === "review_and_open_pr")
                .map((node) => node.label),
        );
        expect(
            graph.edges.filter(
                (edge) => pastedNodeIds.has(edge.from.nodeId) && pastedNodeIds.has(edge.to.nodeId),
            ),
        ).toHaveLength(1);
    });

    it("pastes the last copy made in the editor when the clipboard holds no flow", () => {
        const store = createStoreWith(CANONICAL_FLOW);
        store.getState().select(["dev"]);
        renderCanvas(store);

        fireEvent.copy(document, { clipboardData: createClipboard() });
        fireEvent.paste(document, { clipboardData: createClipboard({ "text/plain": "olá" }) });

        expect(store.getState().graph.nodes).toHaveLength(CANONICAL_FLOW.nodes.length + 1);
    });

    it("leaves the trigger out of a paste and says so", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        store.getState().select(["trigger", "source"]);
        renderCanvas(store);
        const clipboard = createClipboard();

        fireEvent.copy(document, { clipboardData: clipboard });
        fireEvent.paste(document, { clipboardData: clipboard });

        const { nodes } = store.getState().graph;
        expect(nodes.filter((node) => node.type === "trigger")).toHaveLength(1);
        expect(nodes).toHaveLength(CANONICAL_FLOW.nodes.length + 1);
        expect(await screen.findByText(TRIGGER_NOT_PASTED_NOTICE.title)).toBeInTheDocument();
    });

    it("duplicates the selected node next to it with Ctrl+D", () => {
        const store = createStoreWith(CANONICAL_FLOW);
        const original = CANONICAL_FLOW.nodes.find((node) => node.id === "source");
        store.getState().select(["source"]);
        renderCanvas(store);

        fireEvent.keyDown(document, { key: "d", ctrlKey: true });

        const { graph, selection } = store.getState();
        const duplicate = graph.nodes.find((node) => node.id === selection[0]);
        expect(duplicate).toMatchObject({
            type: "source",
            position: {
                x: (original?.position.x ?? 0) + DUPLICATE_OFFSET_PX,
                y: (original?.position.y ?? 0) + DUPLICATE_OFFSET_PX,
            },
        });
    });
});

describe("FlowCanvas shortcuts", () => {
    it("selects every element with Ctrl+A", () => {
        const store = createStoreWith(CANONICAL_FLOW);
        renderCanvas(store);

        fireEvent.keyDown(document, { key: "a", ctrlKey: true });

        expect(store.getState().selection).toHaveLength(
            CANONICAL_FLOW.nodes.length +
                CANONICAL_FLOW.edges.length +
                CANONICAL_FLOW.groups.length,
        );
    });

    it("lists the shortcuts when ? is pressed", async () => {
        renderCanvas(createStoreWith(CANONICAL_FLOW));

        fireEvent.keyDown(document, { key: "?", shiftKey: true });

        const dialog = await screen.findByRole("dialog", { name: "Atalhos do teclado" });
        expect(within(dialog).getAllByRole("term")).toHaveLength(SHORTCUTS.length);
    });

    it("lists the shortcuts from the toolbar", async () => {
        renderCanvas(createStoreWith(CANONICAL_FLOW));

        await userEvent.click(screen.getByRole("button", { name: "Atalhos do teclado" }));

        expect(await screen.findByRole("dialog")).toHaveTextContent("Duplicar a seleção");
    });
});

describe("FlowCanvas read-only", () => {
    const DEVELOPER_TO_REVIEWER_EDGE_ID = "dev.summary->reviewer.context";

    it("renders the graph without the editor toolbar", () => {
        renderReadOnlyCanvas(createStoreWith(CANONICAL_FLOW));

        expect(screen.getAllByLabelText("Dev").length).toBeGreaterThan(0);
        expect(screen.queryByRole("toolbar", { name: "Editor" })).not.toBeInTheDocument();
    });

    it("does not let the nodes be dragged", () => {
        renderReadOnlyCanvas(createStoreWith(CANONICAL_FLOW));

        expect(document.querySelector(".react-flow__node.draggable")).toBeNull();
    });

    it("ignores the editing shortcuts", async () => {
        const store = createStoreWith(CANONICAL_FLOW);
        renderReadOnlyCanvas(store);

        await userEvent.keyboard("{Control>}a{/Control}");

        expect(store.getState().selection).toEqual([]);
    });

    it("marks as flowing only the edges where data flows", () => {
        const { edges } = toReactFlow(CANONICAL_FLOW);

        const markedEdges = markFlowingEdges(edges, new Set([DEVELOPER_TO_REVIEWER_EDGE_ID]));

        const flowingEdgeIds = markedEdges
            .filter((edge) => edge.data?.flowing === true)
            .map((edge) => edge.id);
        expect(flowingEdgeIds).toEqual([DEVELOPER_TO_REVIEWER_EDGE_ID]);
    });
});

const EMPTY_SPOT: Position = { x: 400, y: 260 };
const HANDLE_BOX = { x: 0, y: 0, width: 10, height: 10 };

const FLOW_WITH_SOURCE_AND_WRITER: FlowGraph = {
    ...EMPTY_FLOW,
    nodes: [
        createDefaultNode("source", "source", { x: 0, y: 0 }),
        createDefaultNode("agent", "writer", { x: 300, y: 0 }),
    ],
};

function letGoOnEmptySpace(
    draggedPort: [string, string],
    handleType: HandleType,
    point: Position,
): void {
    const fromHandle = buildHandle(draggedPort, handleType);
    const connectionState: FinalConnectionState = {
        isValid: null,
        from: { x: 0, y: 0 },
        fromHandle,
        fromPosition: fromHandle.position,
        fromNode: buildInternalNode(fromHandle.nodeId),
        to: point,
        toHandle: null,
        toPosition: HandlePosition.Left,
        toNode: null,
        pointer: point,
    };

    callOnConnectEnd(point, connectionState);
}

function letGoOverPort(draggedPort: [string, string], droppedPort: [string, string]): void {
    const fromHandle = buildHandle(draggedPort, "source");
    const toHandle = buildHandle(droppedPort, "target");
    const connectionState: FinalConnectionState = {
        isValid: true,
        from: { x: 0, y: 0 },
        fromHandle,
        fromPosition: fromHandle.position,
        fromNode: buildInternalNode(fromHandle.nodeId),
        to: EMPTY_SPOT,
        toHandle,
        toPosition: toHandle.position,
        toNode: buildInternalNode(toHandle.nodeId),
        pointer: EMPTY_SPOT,
    };

    callOnConnectEnd(EMPTY_SPOT, connectionState);
}

function callOnConnectEnd(point: Position, connectionState: FinalConnectionState): void {
    const pointerUp = new MouseEvent("mouseup", { clientX: point.x, clientY: point.y });

    act(() => recordedReactFlow.onConnectEnd?.(pointerUp, connectionState));
}

function buildHandle([nodeId, port]: [string, string], type: HandleType): Handle {
    return {
        id: port,
        nodeId,
        type,
        position: type === "source" ? HandlePosition.Right : HandlePosition.Left,
        ...HANDLE_BOX,
    };
}

function buildInternalNode(id: string): InternalNode {
    const userNode = { id, position: { x: 0, y: 0 }, data: {} };

    return {
        ...userNode,
        measured: {},
        internals: { positionAbsolute: userNode.position, z: 0, userNode },
    };
}

function renderReadOnlyCanvas(store: EditorStore): void {
    render(
        <ReactFlowProvider>
            <FlowCanvas
                readOnly
                store={store}
                flowingEdgeIds={new Set()}
                onNodeClick={() => undefined}
            />
        </ReactFlowProvider>,
    );
}

function renderCanvas(store: EditorStore, issuesByTarget: IssuesByTarget = new Map()): void {
    render(
        <ToastProvider>
            <ReactFlowProvider>
                <FlowCanvas store={store} issuesByTarget={issuesByTarget} />
            </ReactFlowProvider>
        </ToastProvider>,
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

function appendPromptEditor(): HTMLElement {
    const promptEditor = document.createElement("div");
    promptEditor.setAttribute("contenteditable", "true");
    document.body.append(promptEditor);

    return promptEditor;
}

function createClipboard(initialContent: Record<string, string> = {}): Partial<DataTransfer> {
    const content = new Map(Object.entries(initialContent));

    return {
        setData: (format, text) => content.set(format, text),
        getData: (format) => content.get(format) ?? "",
    };
}
