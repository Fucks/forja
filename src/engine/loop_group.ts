import { nodesInsideGroup } from "@/engine/graph_queries.js";
import { type Condition, evaluateCondition } from "@/shared/conditions.js";
import type { FlowGraph, FlowGroup } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";

export interface LoopInstanceState {
    groupId: string;
    itemId?: string;
    iteration: number;
    maxIterations: number;
    status: "running" | "succeeded" | "exhausted" | "failed" | "canceled";
    // Values of the carry ports in the last iteration.
    carry: Record<string, unknown>;
}

export type LoopNextStep = "repeat" | "exit" | "exhausted";

export interface LoopDecision {
    state: LoopInstanceState;
    next: LoopNextStep;
}

const FIRST_ITERATION = 1;

export function startLoop(group: FlowGroup & { kind: "loop" }, itemId?: string): LoopInstanceState {
    return {
        groupId: group.id,
        itemId,
        iteration: FIRST_ITERATION,
        maxIterations: group.config.maxIterations,
        status: "running",
        carry: {},
    };
}

// Builds the data the `until` condition reads: { "<node slug>": { <port>: value } }.
export function iterationData(
    graph: FlowGraph,
    group: FlowGroup,
    outputsByNodeId: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const node of nodesInsideGroup(graph, group.id)) {
        const outputs = outputsByNodeId[node.id];
        if (outputs) {
            data[nodeSlug(node.label)] = outputs;
        }
    }

    return data;
}

export function decideAfterIteration(
    state: LoopInstanceState,
    until: Condition,
    data: Record<string, unknown>,
    carryPorts: string[],
): LoopDecision {
    const carried = { ...state, carry: collectCarry(data, carryPorts) };
    if (evaluateCondition(until, data)) {
        return { state: { ...carried, status: "succeeded" }, next: "exit" };
    }
    if (state.iteration < state.maxIterations) {
        return { state: { ...carried, iteration: state.iteration + 1 }, next: "repeat" };
    }

    return { state: { ...carried, status: "exhausted" }, next: "exhausted" };
}

export function failLoop(state: LoopInstanceState): LoopInstanceState {
    return { ...state, status: "failed" };
}

export function cancelLoop(state: LoopInstanceState): LoopInstanceState {
    return { ...state, status: "canceled" };
}

function collectCarry(
    data: Record<string, unknown>,
    carryPorts: string[],
): Record<string, unknown> {
    const carry: Record<string, unknown> = {};
    for (const port of carryPorts) {
        const producer = Object.values(data).find((outputs) => hasPort(outputs, port));
        if (producer !== undefined) {
            carry[port] = Reflect.get(producer, port);
        }
    }

    return carry;
}

function hasPort(outputs: unknown, port: string): outputs is object {
    return typeof outputs === "object" && outputs !== null && Object.hasOwn(outputs, port);
}
