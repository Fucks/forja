import { useReactFlow } from "@xyflow/react";
import type { FinalConnectionState, HandleType } from "@xyflow/react";
import { useState } from "react";

import { findNode } from "@/engine/graph_queries.js";
import { newId } from "@/lib/ids.js";
import type { FlowGraph, NodeType, PortType, Position } from "@/shared/flow_graph.js";
import { checkHandles, orientConnection, toHandleRef } from "@/web/canvas/connection_hints.js";
import type { HandleRef } from "@/web/canvas/connection_hints.js";
import { connect } from "@/web/canvas/edge_actions.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import {
    findFirstCompatiblePort,
    listCompatibleNodeTypes,
} from "@/web/canvas/palette/compatible_node_types.js";
import { addNodeAt } from "@/web/canvas/palette/drop_target.js";
import { pointerPosition } from "@/web/canvas/use_canvas_connections.js";

export interface PortDrop {
    draggedHandle: HandleRef;
    portType: PortType;
    screenPosition: Position;
    flowPosition: Position;
}

interface LinkedNodeRequest {
    type: NodeType;
    portDrop: PortDrop;
    nodeId: string;
    edgeId: string;
}

const OPPOSITE_HANDLE_TYPES: Record<HandleType, HandleType> = {
    source: "target",
    target: "source",
};

export interface OpenAddFromPortMenu {
    screenPosition: Position;
    compatibleNodeTypes: NodeType[];
}

export interface AddFromPort {
    openMenu: OpenAddFromPortMenu | undefined;
    onConnectEnd: (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => void;
    addLinkedNode: (type: NodeType) => void;
    closeMenu: () => void;
}

export function useAddFromPort(store: EditorStore): AddFromPort {
    const { screenToFlowPosition } = useReactFlow();
    const [portDrop, setPortDrop] = useState<PortDrop>();

    function onConnectEnd(
        event: MouseEvent | TouchEvent,
        connectionState: FinalConnectionState,
    ): void {
        if (connectionState.toHandle) {
            return;
        }

        const draggedHandle = toHandleRef(connectionState.fromHandle);
        const portType = draggedHandle && findPortType(store.getState().graph, draggedHandle);
        if (!draggedHandle || !portType) {
            return;
        }

        const screenPosition = pointerPosition(event);
        const flowPosition = screenToFlowPosition(screenPosition);
        setPortDrop({ draggedHandle, portType, screenPosition, flowPosition });
    }

    function addLinkedNode(type: NodeType): void {
        if (!portDrop) {
            return;
        }

        const request = { type, portDrop, nodeId: newId("nod"), edgeId: newId("edg") };
        store.getState().applyGraph((graph) => addNodeLinkedToPort(graph, request));
        store.getState().select([request.nodeId]);
        setPortDrop(undefined);
    }

    return {
        openMenu: portDrop && describeMenu(portDrop),
        onConnectEnd,
        addLinkedNode,
        closeMenu: () => setPortDrop(undefined),
    };
}

function findPortType(graph: FlowGraph, handle: HandleRef): PortType | undefined {
    const node = findNode(graph, handle.nodeId);
    const ports = handle.type === "source" ? node?.outputs : node?.inputs;

    return ports?.find((port) => port.name === handle.port)?.type;
}

function describeMenu({ screenPosition, portType, draggedHandle }: PortDrop): OpenAddFromPortMenu {
    return {
        screenPosition,
        compatibleNodeTypes: listCompatibleNodeTypes(portType, draggedHandle.type),
    };
}

function addNodeLinkedToPort(
    graph: FlowGraph,
    { type, portDrop, nodeId, edgeId }: LinkedNodeRequest,
): FlowGraph {
    const { draggedHandle, portType, flowPosition } = portDrop;
    const withNode = addNodeAt(graph, type, flowPosition, () => nodeId);
    const linkedPort = findFirstCompatiblePort(type, portType, draggedHandle.type);
    if (!linkedPort) {
        return withNode;
    }

    const linkedHandle = {
        nodeId,
        port: linkedPort,
        type: OPPOSITE_HANDLE_TYPES[draggedHandle.type],
    };
    if (!checkHandles(withNode, draggedHandle, linkedHandle).ok) {
        return withNode;
    }

    const { from, to } = orientConnection(draggedHandle, linkedHandle);
    return connect(withNode, from, to, () => edgeId);
}
