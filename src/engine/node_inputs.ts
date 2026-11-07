import { incomingEdges } from "@/engine/graph_queries.js";
import { NODE_RUN_TERMINAL, type NodeRunState } from "@/engine/node_run_state.js";
import { type NodeScope, splitsListIntoItems } from "@/engine/node_scopes.js";
import type { WorkItemRef } from "@/engine/scheduler_types.js";
import type { FlowEdge, FlowGraph, FlowNode } from "@/shared/flow_graph.js";

export type InputResolution =
    { kind: "waiting" } | { kind: "skip" } | { kind: "ready"; inputs: Record<string, unknown> };

export interface UpstreamView {
    items: readonly WorkItemRef[] | undefined;
    scopeOf(nodeId: string): NodeScope;
    findNodeRun(nodeId: string, workItemId: string | undefined): NodeRunState | undefined;
}

export interface InputTarget {
    node: FlowNode;
    workItemId: string | undefined;
}

type EdgeValue = { state: "pending" } | { state: "absent" } | { state: "present"; value: unknown };

const PENDING: EdgeValue = { state: "pending" };
const ABSENT: EdgeValue = { state: "absent" };

export function resolveInputs(
    graph: FlowGraph,
    target: InputTarget,
    upstream: UpstreamView,
): InputResolution {
    const edgeValues = incomingEdges(graph, target.node.id).map((edge) => ({
        port: edge.to.port,
        value: resolveEdgeValue(graph, edge, target, upstream),
    }));
    if (edgeValues.some(({ value }) => value.state === "pending")) {
        return { kind: "waiting" };
    }

    const inputs: Record<string, unknown> = {};
    for (const { port, value } of edgeValues) {
        if (value.state !== "present") {
            return { kind: "skip" };
        }
        inputs[port] = value.value;
    }

    return { kind: "ready", inputs };
}

function resolveEdgeValue(
    graph: FlowGraph,
    edge: FlowEdge,
    target: InputTarget,
    upstream: UpstreamView,
): EdgeValue {
    const sourceNodeId = edge.from.nodeId;
    if (upstream.scopeOf(sourceNodeId) === "item") {
        return outputOf(upstream.findNodeRun(sourceNodeId, target.workItemId), edge.from.port);
    }

    const sourceValue = outputOf(upstream.findNodeRun(sourceNodeId, undefined), edge.from.port);
    if (sourceValue.state !== "present" || !splitsListIntoItems(graph, edge)) {
        return sourceValue;
    }

    return currentItemOf(target, upstream);
}

function currentItemOf(target: InputTarget, upstream: UpstreamView): EdgeValue {
    const item = upstream.items?.find((candidate) => candidate.id === target.workItemId);

    return item ? { state: "present", value: item } : ABSENT;
}

function outputOf(nodeRun: NodeRunState | undefined, port: string): EdgeValue {
    if (!nodeRun || !NODE_RUN_TERMINAL.has(nodeRun.status)) {
        return PENDING;
    }
    if (
        nodeRun.status !== "SUCCEEDED" ||
        !nodeRun.outputs ||
        !Object.hasOwn(nodeRun.outputs, port)
    ) {
        return ABSENT;
    }

    return { state: "present", value: nodeRun.outputs[port] };
}
