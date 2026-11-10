import { CycleOutsideLoopError, findNode, topologicalOrder } from "@/engine/graph_queries.js";
import { isConnectionCompatible, resolveConnection } from "@/engine/validation_rules/port_rules.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { connect, type PortRef } from "@/web/canvas/edge_actions.js";

export type ConnectionVerdict = { ok: true } | { ok: false; reason: string };

const CANDIDATE_EDGE_ID = "candidate";

const SELF_CONNECTION_REASON = "Um nó não pode se ligar a si mesmo";
const OUTPUT_TO_OUTPUT_REASON = "Saída → saída não é permitido";
const UNKNOWN_PORT_REASON = "A porta não existe";
const CYCLE_OUTSIDE_LOOP_REASON = "Isto cria um ciclo fora de um loop";

// The rules are the server's (port_rules, graph_queries), applied to the graph as it would be after
// the connection, so the canvas refuses what the flow validation would reject.
export function checkConnection(graph: FlowGraph, from: PortRef, to: PortRef): ConnectionVerdict {
    if (from.nodeId === to.nodeId) {
        return rejected(SELF_CONNECTION_REASON);
    }
    if (isOutputPort(graph, to)) {
        return rejected(OUTPUT_TO_OUTPUT_REASON);
    }

    const connectedGraph = connect(graph, from, to, () => CANDIDATE_EDGE_ID);
    const connection = resolveConnection(connectedGraph, { id: CANDIDATE_EDGE_ID, from, to });
    if (!connection) {
        return rejected(UNKNOWN_PORT_REASON);
    }
    if (!isConnectionCompatible(connectedGraph, connection)) {
        const { sourcePort, targetPort } = connection;
        return rejected(`Tipos incompatíveis: ${sourcePort.type} → ${targetPort.type}`);
    }
    if (hasCycleOutsideLoop(connectedGraph) && !hasCycleOutsideLoop(graph)) {
        return rejected(CYCLE_OUTSIDE_LOOP_REASON);
    }

    return { ok: true };
}

function rejected(reason: string): ConnectionVerdict {
    return { ok: false, reason };
}

function isOutputPort(graph: FlowGraph, port: PortRef): boolean {
    const node = findNode(graph, port.nodeId);

    return node?.outputs.some((output) => output.name === port.port) ?? false;
}

function hasCycleOutsideLoop(graph: FlowGraph): boolean {
    try {
        topologicalOrder(graph);
        return false;
    } catch (error) {
        if (error instanceof CycleOutsideLoopError) {
            return true;
        }
        throw error;
    }
}
