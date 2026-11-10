import { ReactFlowProvider } from "@xyflow/react";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";

import type { FlowGraph, FlowGroup, NodeType, Position } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { FlowCanvas } from "@/web/canvas/flow_canvas.js";

const CANONICAL_FLOW = buildCanonicalFlow();
const EMPTY_FLOW: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };
const NODE_TYPE_DRAG_FORMAT = "application/forja-node-type";

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

function renderCanvas(store: EditorStore): void {
    render(
        <ReactFlowProvider>
            <FlowCanvas store={store} />
        </ReactFlowProvider>,
    );
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
