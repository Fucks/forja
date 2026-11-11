import { act, renderHook } from "@testing-library/react";

import { buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import type { RFNode } from "@/web/canvas/graph_mapping.js";
import { useCanvasElements } from "@/web/canvas/use_canvas_elements.js";
import type { CanvasElements } from "@/web/canvas/use_canvas_elements.js";

const LOOP_FLOW = buildLoopFlow();

function createLoopStore(): EditorStore {
    const store = createEditorStore();
    store.getState().load({
        flowId: "flw_loop",
        graph: LOOP_FLOW,
        revision: 1,
        updatedAt: "2026-11-09T12:00:00Z",
    });

    return store;
}

function findSavedPosition(store: EditorStore, nodeId: string): { x: number; y: number } {
    const node = store.getState().graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
        throw new Error(`No flow node with id "${nodeId}"`);
    }

    return node.position;
}

function findCanvasNode(elements: CanvasElements, nodeId: string): RFNode {
    const node = elements.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
        throw new Error(`No canvas node with id "${nodeId}"`);
    }

    return node;
}

describe("useCanvasElements", () => {
    it("saves the absolute position of a node dragged inside nested groups", () => {
        const store = createLoopStore();
        const before = findSavedPosition(store, "tests");
        const { result } = renderHook(() => useCanvasElements(store));
        const relativePosition = findCanvasNode(result.current, "tests").position;

        act(() =>
            result.current.onNodesChange([
                {
                    id: "tests",
                    type: "position",
                    position: { x: relativePosition.x + 30, y: relativePosition.y + 10 },
                },
            ]),
        );

        expect(findSavedPosition(store, "tests")).toEqual({ x: before.x + 30, y: before.y + 10 });
        expect(store.getState().dirty).toBe(true);
    });

    it("saves the size of a group resized on the canvas", () => {
        const store = createLoopStore();
        const { result } = renderHook(() => useCanvasElements(store));

        act(() =>
            result.current.onNodesChange([
                {
                    id: "review_loop",
                    type: "dimensions",
                    dimensions: { width: 900, height: 400 },
                    resizing: true,
                    setAttributes: true,
                },
            ]),
        );

        const resizedGroup = store.getState().graph.groups.find(({ id }) => id === "review_loop");
        expect(resizedGroup?.size).toEqual({ width: 900, height: 400 });
    });

    it("keeps measured sizes on the nodes without changing the graph", () => {
        const store = createLoopStore();
        const { result } = renderHook(() => useCanvasElements(store));

        act(() =>
            result.current.onNodesChange([
                { id: "dev", type: "dimensions", dimensions: { width: 240, height: 96 } },
            ]),
        );

        expect(findCanvasNode(result.current, "dev").measured).toEqual({ width: 240, height: 96 });
        expect(store.getState().dirty).toBe(false);
    });

    it("selects in the store what is selected on the canvas", () => {
        const store = createLoopStore();
        const { result } = renderHook(() => useCanvasElements(store));

        act(() => result.current.onNodesChange([{ id: "dev", type: "select", selected: true }]));

        expect(store.getState().selection).toEqual(["dev"]);
        expect(findCanvasNode(result.current, "dev").selected).toBe(true);
    });

    it("selects edges along with nodes", () => {
        const store = createLoopStore();
        const edgeId = "trigger.items->source.trigger";
        const { result } = renderHook(() => useCanvasElements(store));

        act(() => result.current.onNodesChange([{ id: "dev", type: "select", selected: true }]));
        act(() => result.current.onEdgesChange([{ id: edgeId, type: "select", selected: true }]));

        expect(store.getState().selection).toEqual(["dev", edgeId]);
    });
});
