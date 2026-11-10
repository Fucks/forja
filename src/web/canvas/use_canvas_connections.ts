import type {
    Connection,
    FinalConnectionState,
    IsValidConnection,
    OnConnect,
    OnConnectEnd,
} from "@xyflow/react";
import { useEffect, useState } from "react";

import { newId } from "@/lib/ids.js";
import type { Position } from "@/shared/flow_graph.js";
import { checkHandles, type HandleRef, toHandleRef } from "@/web/canvas/connection_hints.js";
import { checkConnection } from "@/web/canvas/connection_rules.js";
import { connect } from "@/web/canvas/edge_actions.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { toConnectionPorts } from "@/web/canvas/graph_mapping.js";
import type { RFEdge } from "@/web/canvas/graph_mapping.js";

export const REJECTION_VISIBLE_MS = 3_000;

export interface ConnectionRejection {
    reason: string;
    screenPosition: Position;
}

export interface CanvasConnections {
    isValidConnection: IsValidConnection<RFEdge>;
    onConnect: OnConnect;
    onConnectEnd: OnConnectEnd;
    rejection: ConnectionRejection | undefined;
}

export function useCanvasConnections(store: EditorStore): CanvasConnections {
    const [rejection, showRejection] = useTemporaryRejection();

    function isValidConnection(connection: Connection | RFEdge): boolean {
        const ports = toConnectionPorts(connection);
        if (!ports) {
            return false;
        }

        return checkConnection(store.getState().graph, ports.from, ports.to).ok;
    }

    function onConnect(connection: Connection): void {
        const ports = toConnectionPorts(connection);
        if (!ports) {
            return;
        }

        const edgeId = newId("edg");
        store.getState().applyGraph((graph) => connect(graph, ports.from, ports.to, () => edgeId));
    }

    function onConnectEnd(
        event: MouseEvent | TouchEvent,
        connectionState: FinalConnectionState,
    ): void {
        const handles = findRejectedHandles(connectionState);
        if (!handles) {
            return;
        }

        const verdict = checkHandles(store.getState().graph, handles.dragged, handles.dropped);
        if (verdict.ok) {
            return;
        }

        showRejection({ reason: verdict.reason, screenPosition: pointerPosition(event) });
    }

    return { isValidConnection, onConnect, onConnectEnd, rejection };
}

function useTemporaryRejection(): [
    ConnectionRejection | undefined,
    (rejection: ConnectionRejection) => void,
] {
    const [rejection, setRejection] = useState<ConnectionRejection>();

    useEffect(() => {
        if (!rejection) {
            return;
        }

        const timer = setTimeout(() => setRejection(undefined), REJECTION_VISIBLE_MS);
        return () => clearTimeout(timer);
    }, [rejection]);

    return [rejection, setRejection];
}

function findRejectedHandles(
    connectionState: FinalConnectionState,
): { dragged: HandleRef; dropped: HandleRef } | undefined {
    if (connectionState.isValid !== false) {
        return undefined;
    }

    const dragged = toHandleRef(connectionState.fromHandle);
    const dropped = toHandleRef(connectionState.toHandle);
    if (!dragged || !dropped) {
        return undefined;
    }

    return { dragged, dropped };
}

function pointerPosition(event: MouseEvent | TouchEvent): Position {
    if ("changedTouches" in event) {
        const touch = event.changedTouches[0];
        return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
    }

    return { x: event.clientX, y: event.clientY };
}
