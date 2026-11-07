import { incomingEdges, isLoopExhaustedEdge } from "@/engine/graph_queries.js";
import type { LoopInstanceState } from "@/engine/loop_group.js";
import { isMapDone, itemIdsWithStatus, type MapGroupState } from "@/engine/map_group.js";
import { NODE_RUN_TERMINAL, type NodeRunState } from "@/engine/node_run_state.js";
import {
    collectsItemsIntoList,
    type NodeScope,
    splitsListIntoItems,
} from "@/engine/node_scopes.js";
import type { WorkItemRef } from "@/engine/scheduler_types.js";
import type { FlowEdge, FlowGraph, FlowNode } from "@/shared/flow_graph.js";

export type InputResolution =
    { kind: "waiting" } | { kind: "skip" } | { kind: "ready"; inputs: Record<string, unknown> };

export interface UpstreamView {
    items: readonly WorkItemRef[] | undefined;
    scopeOf(nodeId: string): NodeScope;
    findNodeRun(nodeId: string, workItemId: string | undefined): NodeRunState | undefined;
    // The innermost map around the node.
    mapGroupOf(nodeId: string): MapGroupState | undefined;
    loops: LoopView;
}

export interface LoopView {
    isBackEdge(edge: FlowEdge): boolean;
    find(groupId: string, workItemId: string | undefined): LoopInstanceState | undefined;
    // The instance of the innermost loop around the node.
    loopOf(nodeId: string, workItemId: string | undefined): LoopInstanceState | undefined;
    loopLeftBy(edge: FlowEdge, workItemId: string | undefined): LoopInstanceState | undefined;
}

export interface InputTarget {
    node: FlowNode;
    workItemId: string | undefined;
}

type EdgeValue = { state: "pending" } | { state: "absent" } | { state: "present"; value: unknown };
type PresentValue = Extract<EdgeValue, { state: "present" }>;

const PENDING: EdgeValue = { state: "pending" };
const ABSENT: EdgeValue = { state: "absent" };

export function resolveInputs(
    graph: FlowGraph,
    target: InputTarget,
    upstream: UpstreamView,
): InputResolution {
    // A back edge only draws the cycle of a loop: values return through the carry ports.
    const forwardEdges = incomingEdges(graph, target.node.id).filter(
        (edge) => !upstream.loops.isBackEdge(edge),
    );
    const edgeValues = forwardEdges.map((edge) => ({
        port: edge.to.port,
        value: resolveEdgeValue(graph, edge, target, upstream),
    }));
    if (edgeValues.some(({ value }) => value.state === "pending")) {
        return { kind: "waiting" };
    }

    const inputs: Record<string, unknown> = { ...carriedInputsOf(target, upstream) };
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
    if (isLoopExhaustedEdge(graph, edge)) {
        return exhaustedLoopValue(edge, target, upstream);
    }

    const sourceMap = upstream.mapGroupOf(edge.from.nodeId);
    const targetMapGroupId = upstream.mapGroupOf(target.node.id)?.groupId;
    if (!sourceMap || sourceMap.groupId === targetMapGroupId) {
        return resolveEdgeInsideScope(graph, edge, target, upstream);
    }
    if (collectsItemsIntoList(graph, edge)) {
        return collectMapOutput(edge, upstream, sourceMap);
    }
    if (sourceMap.barrier && !isMapDone(sourceMap)) {
        return PENDING;
    }

    return sourceOutputOf(edge, target.workItemId, upstream);
}

// One value per item that succeeded in the map, in the order of the run's item list.
function collectMapOutput(
    edge: FlowEdge,
    upstream: UpstreamView,
    sourceMap: MapGroupState,
): EdgeValue {
    if (!isMapDone(sourceMap)) {
        return PENDING;
    }

    const succeededItemIds = new Set(itemIdsWithStatus(sourceMap, "succeeded"));
    const collectedValues = (upstream.items ?? [])
        .filter((item) => succeededItemIds.has(item.id))
        .map((item) => sourceOutputOf(edge, item.id, upstream))
        .filter(isPresent)
        .map((present) => present.value);
    if (collectedValues.length === 0) {
        return ABSENT;
    }

    return { state: "present", value: collectedValues };
}

function resolveEdgeInsideScope(
    graph: FlowGraph,
    edge: FlowEdge,
    target: InputTarget,
    upstream: UpstreamView,
): EdgeValue {
    const sourceNodeId = edge.from.nodeId;
    if (upstream.scopeOf(sourceNodeId) === "item") {
        return sourceOutputOf(edge, target.workItemId, upstream);
    }

    const sourceValue = sourceOutputOf(edge, undefined, upstream);
    if (sourceValue.state !== "present" || !splitsListIntoItems(graph, edge)) {
        return sourceValue;
    }

    return currentItemOf(target, upstream);
}

function carriedInputsOf(target: InputTarget, upstream: UpstreamView): Record<string, unknown> {
    return upstream.loops.loopOf(target.node.id, target.workItemId)?.carry ?? {};
}

function exhaustedLoopValue(
    edge: FlowEdge,
    target: InputTarget,
    upstream: UpstreamView,
): EdgeValue {
    const loop = upstream.loops.find(edge.from.nodeId, target.workItemId);
    if (!loop || loop.status === "running") {
        return PENDING;
    }
    if (loop.status !== "exhausted") {
        return ABSENT;
    }

    return currentItemOf(target, upstream);
}

// Values leave a loop only once it exits: an exhausted, failed or canceled loop sends nothing.
function sourceOutputOf(
    edge: FlowEdge,
    workItemId: string | undefined,
    upstream: UpstreamView,
): EdgeValue {
    const leftLoop = upstream.loops.loopLeftBy(edge, workItemId);
    if (leftLoop?.status === "running") {
        return PENDING;
    }
    if (leftLoop && leftLoop.status !== "succeeded") {
        return ABSENT;
    }

    return outputOf(upstream.findNodeRun(edge.from.nodeId, workItemId), edge.from.port);
}

function currentItemOf(target: InputTarget, upstream: UpstreamView): EdgeValue {
    const item = upstream.items?.find((candidate) => candidate.id === target.workItemId);

    return item ? { state: "present", value: item } : ABSENT;
}

function isPresent(value: EdgeValue): value is PresentValue {
    return value.state === "present";
}

function outputOf(nodeRun: NodeRunState | undefined, port: string): EdgeValue {
    if (!nodeRun || !NODE_RUN_TERMINAL.has(nodeRun.status)) {
        return PENDING;
    }
    if (nodeRun.status !== "SUCCEEDED" || !nodeRun.outputs) {
        return ABSENT;
    }
    // A condition only fills the port of the branch it chose.
    if (!Object.hasOwn(nodeRun.outputs, port)) {
        return ABSENT;
    }

    return { state: "present", value: nodeRun.outputs[port] };
}
