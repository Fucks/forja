import { Position as HandlePosition } from "@xyflow/react";
import type { FinalConnectionState, Handle, HandleType, InternalNode } from "@xyflow/react";
import { act, renderHook } from "@testing-library/react";

import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { connect } from "@/test/factories/flow_graph_factory.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { REJECTION_VISIBLE_MS, useCanvasConnections } from "@/web/canvas/use_canvas_connections.js";

const ORIGIN = { x: 0, y: 0 };
const POINTER = { x: 320, y: 180 };
const HANDLE_BOX = { x: 0, y: 0, width: 10, height: 10 };
const NO_CONNECTION: FinalConnectionState = {
    isValid: null,
    from: null,
    fromHandle: null,
    fromPosition: null,
    fromNode: null,
    to: null,
    toHandle: null,
    toPosition: null,
    toNode: null,
    pointer: null,
};

describe("useCanvasConnections", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("connects an output to an input of the same type", () => {
        const store = createStoreWith(buildAgents(["writer", "reader"]));
        const { result } = renderHook(() => useCanvasConnections(store));

        act(() =>
            result.current.onConnect(rfConnection(["writer", "summary"], ["reader", "context"])),
        );

        const [edge] = store.getState().graph.edges;
        expect(edge).toMatchObject({
            from: { nodeId: "writer", port: "summary" },
            to: { nodeId: "reader", port: "context" },
        });
        expect(edge?.id.startsWith("edg_")).toBe(true);
    });

    it("replaces the edge already connected to the input", () => {
        const earlierEdge = connect(["writer", "summary"], ["reader", "context"]);
        const store = createStoreWith({
            ...buildAgents(["writer", "editor", "reader"]),
            edges: [earlierEdge],
        });
        const { result } = renderHook(() => useCanvasConnections(store));

        act(() =>
            result.current.onConnect(rfConnection(["editor", "summary"], ["reader", "context"])),
        );

        expect(store.getState().graph.edges.map((edge) => edge.from.nodeId)).toEqual(["editor"]);
    });

    it("refuses a connection between incompatible types while dragging", () => {
        const store = createStoreWith(buildAgents(["writer", "reader"]));
        const { result } = renderHook(() => useCanvasConnections(store));

        const isValid = result.current.isValidConnection(
            rfConnection(["writer", "summary"], ["reader", "item"]),
        );

        expect(isValid).toBe(false);
    });

    it("shows why a connection dropped on an incompatible port was refused", () => {
        const store = createStoreWith(buildAgents(["writer", "reader"]));
        const { result } = renderHook(() => useCanvasConnections(store));

        act(() => dropOnPort(result.current.onConnectEnd, ["reader", "item"]));

        expect(result.current.rejection).toEqual({
            reason: "Tipos incompatíveis: text → workItem",
            screenPosition: POINTER,
        });
    });

    it("hides the refusal reason after three seconds", () => {
        vi.useFakeTimers();
        const store = createStoreWith(buildAgents(["writer", "reader"]));
        const { result } = renderHook(() => useCanvasConnections(store));
        act(() => dropOnPort(result.current.onConnectEnd, ["reader", "item"]));

        act(() => {
            vi.advanceTimersByTime(REJECTION_VISIBLE_MS);
        });

        expect(result.current.rejection).toBeUndefined();
    });

    it("shows no reason when the connection is dropped away from any port", () => {
        const store = createStoreWith(buildAgents(["writer", "reader"]));
        const { result } = renderHook(() => useCanvasConnections(store));

        act(() => dropAwayFromPorts(result.current.onConnectEnd));

        expect(result.current.rejection).toBeUndefined();
    });
});

function buildAgents(ids: string[]): FlowGraph {
    const nodes: FlowNode[] = ids.map((id) => createDefaultNode("agent", id, ORIGIN));

    return { schemaVersion: 2, nodes, edges: [], groups: [] };
}

function createStoreWith(graph: FlowGraph): EditorStore {
    const store = createEditorStore();
    store.getState().load({
        flowId: "flw_conexoes",
        graph,
        revision: 1,
        updatedAt: "2026-11-10T12:00:00Z",
    });

    return store;
}

function rfConnection(
    [source, sourceHandle]: [string, string],
    [target, targetHandle]: [string, string],
): { source: string; sourceHandle: string; target: string; targetHandle: string } {
    return { source, sourceHandle, target, targetHandle };
}

function dropOnPort(
    onConnectEnd: (event: MouseEvent, state: FinalConnectionState) => void,
    droppedPort: [string, string],
): void {
    onConnectEnd(buildPointerUp(), buildRefusedDrop(["writer", "summary"], droppedPort));
}

function dropAwayFromPorts(
    onConnectEnd: (event: MouseEvent, state: FinalConnectionState) => void,
): void {
    onConnectEnd(buildPointerUp(), NO_CONNECTION);
}

function buildPointerUp(): MouseEvent {
    return new MouseEvent("mouseup", { clientX: POINTER.x, clientY: POINTER.y });
}

// The state React Flow reports when a connection is let go over a port that isValidConnection refused.
function buildRefusedDrop(
    draggedPort: [string, string],
    droppedPort: [string, string],
): FinalConnectionState {
    const fromHandle = buildHandle(draggedPort, "source");
    const toHandle = buildHandle(droppedPort, "target");

    return {
        isValid: false,
        from: ORIGIN,
        fromHandle,
        fromPosition: fromHandle.position,
        fromNode: buildInternalNode(fromHandle.nodeId),
        to: POINTER,
        toHandle,
        toPosition: toHandle.position,
        toNode: buildInternalNode(toHandle.nodeId),
        pointer: POINTER,
    };
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
    const userNode = { id, position: ORIGIN, data: {} };

    return { ...userNode, measured: {}, internals: { positionAbsolute: ORIGIN, z: 0, userNode } };
}
