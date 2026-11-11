import { ReactFlowProvider } from "@xyflow/react";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import type { FlowGraph, FlowGroup, Position } from "@/shared/flow_graph.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { toReactFlow } from "@/web/canvas/graph_mapping.js";
import type { RFNode } from "@/web/canvas/graph_mapping.js";
import { useNodeReparenting } from "@/web/canvas/use_node_reparenting.js";

const CANONICAL_FLOW = buildCanonicalFlow();
const OUTSIDE_EVERY_GROUP: Position = { x: -500, y: -500 };

// Without a real viewport, screen and flow positions match.
describe("useNodeReparenting", () => {
    it("removes the group of a node dragged out of it", () => {
        const store = createStoreWith(CANONICAL_FLOW);
        const { result } = renderHook(() => useNodeReparenting(store), { wrapper: CanvasProvider });

        act(() =>
            result.current.onNodeDragStop(pointerAt(OUTSIDE_EVERY_GROUP), findRFNode("dev"), []),
        );

        expect(findParentGroupId(store, "dev")).toBeUndefined();
    });

    it("puts a node dragged into a group inside it", () => {
        const store = createStoreWith(CANONICAL_FLOW);
        const developGroup = findCanonicalGroup("develop");
        const { result } = renderHook(() => useNodeReparenting(store), { wrapper: CanvasProvider });

        act(() =>
            result.current.onNodeDragStop(
                pointerAt(centerOf(developGroup)),
                findRFNode("source"),
                [],
            ),
        );

        expect(findParentGroupId(store, "source")).toBe("develop");
    });

    it("leaves a dragged group where it is in the hierarchy", () => {
        const store = createStoreWith(CANONICAL_FLOW);
        const { result } = renderHook(() => useNodeReparenting(store), { wrapper: CanvasProvider });

        act(() =>
            result.current.onNodeDragStop(
                pointerAt(OUTSIDE_EVERY_GROUP),
                findRFNode("develop"),
                [],
            ),
        );

        expect(store.getState().graph).toBe(CANONICAL_FLOW);
    });
});

function CanvasProvider({ children }: { children: ReactNode }): ReactNode {
    return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

function findCanonicalGroup(groupId: string): FlowGroup {
    const group = CANONICAL_FLOW.groups.find((candidate) => candidate.id === groupId);
    if (!group) {
        throw new Error(`The canonical flow has no group "${groupId}"`);
    }

    return group;
}

function centerOf({ position, size }: FlowGroup): Position {
    return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
}

function createStoreWith(graph: FlowGraph): EditorStore {
    const store = createEditorStore();
    store.getState().load({ flowId: "flw", graph, revision: 1, updatedAt: "2026-11-11T12:00:00Z" });

    return store;
}

function findRFNode(id: string): RFNode {
    const node = toReactFlow(CANONICAL_FLOW).nodes.find((candidate) => candidate.id === id);
    if (!node) {
        throw new Error(`No canvas node with id "${id}"`);
    }

    return node;
}

function pointerAt({ x, y }: Position): MouseEvent {
    return new MouseEvent("mouseup", { clientX: x, clientY: y });
}

function findParentGroupId(store: EditorStore, nodeId: string): string | undefined {
    return store.getState().graph.nodes.find((node) => node.id === nodeId)?.parentGroupId;
}
