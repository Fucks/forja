import { nodesInsideGroup } from "@/engine/graph_queries.js";
import { type Condition, evaluateCondition } from "@/shared/conditions.js";
import type { DataContext, NodeOutputsBySlug } from "@/shared/data_context.js";
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

// The `until` reads only the nodes of the loop, in the iteration that just finished.
export type LoopIterationData = Pick<DataContext, "nodes">;

type LoopNextStep = "repeat" | "exit" | "exhausted";

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

export function iterationData(
    graph: FlowGraph,
    group: FlowGroup,
    outputsByNodeId: Record<string, Record<string, unknown>>,
): LoopIterationData {
    const nodes: NodeOutputsBySlug = {};
    for (const node of nodesInsideGroup(graph, group.id)) {
        const outputs = outputsByNodeId[node.id];
        if (outputs) {
            nodes[nodeSlug(node.label)] = outputs;
        }
    }

    return { nodes };
}

export function decideAfterIteration(
    state: LoopInstanceState,
    until: Condition,
    data: LoopIterationData,
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

function collectCarry(data: LoopIterationData, carryPorts: string[]): Record<string, unknown> {
    const carry: Record<string, unknown> = {};
    for (const port of carryPorts) {
        const producer = Object.values(data.nodes).find((outputs) => Object.hasOwn(outputs, port));
        if (producer !== undefined) {
            carry[port] = producer[port];
        }
    }

    return carry;
}
