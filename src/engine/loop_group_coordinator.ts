import type { FlowPlan } from "@/engine/flow_plan.js";
import type { LoopGroup } from "@/engine/graph_queries.js";
import {
    cancelLoop,
    decideAfterIteration,
    failLoop,
    iterationData,
    type LoopInstanceState,
    startLoop,
} from "@/engine/loop_group.js";
import type { LoopView } from "@/engine/node_inputs.js";
import type { NodeRunRegistry } from "@/engine/node_run_registry.js";
import { NODE_RUN_TERMINAL, type NodeRunState } from "@/engine/node_run_state.js";
import { assertNever } from "@/lib/assert_never.js";
import type { FlowEdge } from "@/shared/flow_graph.js";

export interface LoopGroupCoordinatorDependencies {
    plan: FlowPlan;
    nodeRuns: NodeRunRegistry;
    // From a snapshot; empty for a new run.
    savedStates: LoopInstanceState[];
    createPendingNodeRuns(nodeIds: string[], itemId: string | undefined): void;
    isRunStopping(): boolean;
}

type IterationOutcome = "completed" | "failed" | "canceled" | "skipped";

const ITERATION_OUTSIDE_LOOPS = 0;

// Repeats the subgraph of each loop, one instance per item: when every NodeRun of the current
// iteration is terminal, it decides between another iteration, the exit and the exhausted port.
export class LoopGroupCoordinator implements LoopView {
    private readonly plan: FlowPlan;
    private readonly nodeRuns: NodeRunRegistry;
    private readonly instancesByKey = new Map<string, LoopInstanceState>();

    constructor(private readonly dependencies: LoopGroupCoordinatorDependencies) {
        this.plan = dependencies.plan;
        this.nodeRuns = dependencies.nodeRuns;
        dependencies.savedStates.forEach((state) => this.save(state));
    }

    states(): LoopInstanceState[] {
        return [...this.instancesByKey.values()];
    }

    isBackEdge(edge: FlowEdge): boolean {
        return this.plan.isLoopBackEdge(edge);
    }

    find(groupId: string, itemId: string | undefined): LoopInstanceState | undefined {
        return this.instancesByKey.get(instanceKey(groupId, itemId));
    }

    loopOf(nodeId: string, itemId: string | undefined): LoopInstanceState | undefined {
        const loopGroup = this.plan.loopGroupOf(nodeId);

        return loopGroup && this.find(loopGroup.id, itemId);
    }

    loopLeftBy(edge: FlowEdge, itemId: string | undefined): LoopInstanceState | undefined {
        const loopGroup = this.plan.loopGroupLeftBy(edge);

        return loopGroup && this.find(loopGroup.id, itemId);
    }

    iterationOf(nodeId: string, itemId: string | undefined): number {
        return this.loopOf(nodeId, itemId)?.iteration ?? ITERATION_OUTSIDE_LOOPS;
    }

    startLoopsOf(nodeIds: string[], itemId: string | undefined): void {
        const loopGroups = new Set(nodeIds.map((nodeId) => this.plan.loopGroupOf(nodeId)));
        for (const loopGroup of loopGroups) {
            if (loopGroup && !this.find(loopGroup.id, itemId)) {
                this.save(startLoop(loopGroup, itemId));
            }
        }
    }

    // Returns whether any loop finished an iteration, so the scheduler keeps moving.
    finishSettledIterations(): boolean {
        const settledInstances = this.states().filter((instance) => this.isSettled(instance));
        for (const instance of settledInstances) {
            this.finishIteration(instance);
        }

        return settledInstances.length > 0;
    }

    private isSettled(instance: LoopInstanceState): boolean {
        if (instance.status !== "running") {
            return false;
        }

        const iterationNodeRuns = this.iterationNodeRunsOf(instance);

        return (
            iterationNodeRuns.length > 0 &&
            iterationNodeRuns.every((nodeRun) => NODE_RUN_TERMINAL.has(nodeRun.status))
        );
    }

    private finishIteration(instance: LoopInstanceState): void {
        const iterationNodeRuns = this.iterationNodeRunsOf(instance);
        const outcome = iterationOutcomeOf(iterationNodeRuns);
        switch (outcome) {
            case "completed":
                this.decideNextStep(instance, iterationNodeRuns);
                break;
            case "failed":
                this.save(failLoop(instance));
                break;
            case "canceled":
            case "skipped":
                this.save(cancelLoop(instance));
                break;
            default:
                assertNever(outcome);
        }
    }

    private decideNextStep(instance: LoopInstanceState, iterationNodeRuns: NodeRunState[]): void {
        const loopGroup = this.loopGroupOf(instance);
        const data = iterationData(this.plan.graph, loopGroup, outputsByNodeId(iterationNodeRuns));
        const { until, carry } = loopGroup.config;
        const decision = decideAfterIteration(instance, until, data, carry);
        if (decision.next !== "repeat") {
            this.save(decision.state);
            return;
        }
        if (this.dependencies.isRunStopping()) {
            this.save(cancelLoop(instance));
            return;
        }

        this.save(decision.state);
        this.dependencies.createPendingNodeRuns(
            this.plan.memberNodeIdsOfLoop(instance.groupId),
            instance.itemId,
        );
    }

    private iterationNodeRunsOf(instance: LoopInstanceState): NodeRunState[] {
        return this.plan
            .memberNodeIdsOfLoop(instance.groupId)
            .map((nodeId) => this.nodeRuns.find(nodeId, instance.itemId))
            .filter((nodeRun) => nodeRun !== undefined)
            .filter((nodeRun) => nodeRun.iteration === instance.iteration);
    }

    private loopGroupOf(instance: LoopInstanceState): LoopGroup {
        const loopGroup = this.plan.findLoopGroup(instance.groupId);
        if (!loopGroup) {
            throw new UnknownLoopGroupError(instance.groupId);
        }

        return loopGroup;
    }

    private save(state: LoopInstanceState): void {
        this.instancesByKey.set(instanceKey(state.groupId, state.itemId), state);
    }
}

export class UnknownLoopGroupError extends Error {
    constructor(readonly groupId: string) {
        super(`Loop group ${groupId} is not part of this flow`);
        this.name = "UnknownLoopGroupError";
    }
}

function iterationOutcomeOf(iterationNodeRuns: NodeRunState[]): IterationOutcome {
    const hasStatus = (status: NodeRunState["status"]) =>
        iterationNodeRuns.some((nodeRun) => nodeRun.status === status);
    if (hasStatus("FAILED")) {
        return "failed";
    }
    if (hasStatus("CANCELED")) {
        return "canceled";
    }
    // Nothing in the loop ran (a branch not taken upstream): no output to test the condition on.
    if (!hasStatus("SUCCEEDED")) {
        return "skipped";
    }

    return "completed";
}

function outputsByNodeId(nodeRuns: NodeRunState[]): Record<string, Record<string, unknown>> {
    const outputs: Record<string, Record<string, unknown>> = {};
    for (const nodeRun of nodeRuns) {
        if (nodeRun.outputs) {
            outputs[nodeRun.nodeId] = nodeRun.outputs;
        }
    }

    return outputs;
}

function instanceKey(groupId: string, itemId: string | undefined): string {
    return JSON.stringify([groupId, itemId ?? null]);
}
