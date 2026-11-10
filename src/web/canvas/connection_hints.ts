import { useConnection, useNodeId } from "@xyflow/react";
import type { ConnectionState, Handle, HandleType } from "@xyflow/react";
import { createContext, useContext, useMemo } from "react";

import type { FlowGraph } from "@/shared/flow_graph.js";
import { checkConnection, type ConnectionVerdict } from "@/web/canvas/connection_rules.js";
import type { PortRef } from "@/web/canvas/edge_actions.js";
import type { ConnectionPorts } from "@/web/canvas/graph_mapping.js";

type ReactFlowHandle = Pick<Handle, "nodeId" | "id" | "type">;

export type PortHint = "compatible" | "incompatible" | "none";

export interface HandleRef {
    nodeId: string;
    port: string;
    type: HandleType;
}

export const ConnectionGraphContext = createContext<FlowGraph | undefined>(undefined);

export function usePortHint(port: string, type: HandleType): PortHint {
    const graph = useContext(ConnectionGraphContext);
    const nodeId = useNodeId();
    const draggedHandle = useConnection(findDraggedHandle);

    return useMemo(() => {
        if (!graph || !nodeId || !draggedHandle) {
            return "none";
        }

        return hintPort(graph, draggedHandle, { nodeId, port, type });
    }, [graph, nodeId, draggedHandle, port, type]);
}

export function hintPort(
    graph: FlowGraph,
    draggedHandle: HandleRef,
    candidateHandle: HandleRef,
): PortHint {
    if (isSamePort(draggedHandle, candidateHandle)) {
        return "none";
    }

    return checkHandles(graph, draggedHandle, candidateHandle).ok ? "compatible" : "incompatible";
}

export function checkHandles(
    graph: FlowGraph,
    draggedHandle: HandleRef,
    droppedHandle: HandleRef,
): ConnectionVerdict {
    const { from, to } = orientConnection(draggedHandle, droppedHandle);

    return checkConnection(graph, from, to);
}

export function toHandleRef(handle: ReactFlowHandle | null): HandleRef | undefined {
    if (!handle?.id) {
        return undefined;
    }

    return { nodeId: handle.nodeId, port: handle.id, type: handle.type };
}

function findDraggedHandle(connection: ConnectionState): HandleRef | undefined {
    return toHandleRef(connection.fromHandle);
}

function isSamePort(a: HandleRef, b: HandleRef): boolean {
    return a.nodeId === b.nodeId && a.port === b.port;
}

// A connection dragged out of an input runs backwards: the handle it is dropped on is its origin.
function orientConnection(draggedHandle: HandleRef, droppedHandle: HandleRef): ConnectionPorts {
    const dragged = toPortRef(draggedHandle);
    const dropped = toPortRef(droppedHandle);
    if (draggedHandle.type === "target") {
        return { from: dropped, to: dragged };
    }

    return { from: dragged, to: dropped };
}

function toPortRef(handle: HandleRef): PortRef {
    return { nodeId: handle.nodeId, port: handle.port };
}
