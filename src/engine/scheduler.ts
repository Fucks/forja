import { AgentStartPacer } from "@/engine/agent_start_pacer.js";
import { FlowPlan } from "@/engine/flow_plan.js";
import { type InputResolution, resolveInputs } from "@/engine/node_inputs.js";
import { NodeRunRegistry } from "@/engine/node_run_registry.js";
import {
    type NodeRunError,
    type NodeRunState,
    transitionNodeRun,
} from "@/engine/node_run_state.js";
import { RUN_TERMINAL, type RunState, transitionRun } from "@/engine/run_state.js";
import { compareQueueOrder, type QueuePosition } from "@/engine/scheduler_queue.js";
import { restoreSnapshot, takeSnapshot } from "@/engine/scheduler_snapshot.js";
import {
    type Scheduler,
    type SchedulerCommand,
    type SchedulerEvent,
    type SchedulerOptions,
    type SchedulerSnapshot,
    type SchedulerState,
    type StopOutcome,
    TRIGGER_ITEMS_PORT,
    type WorkItemRef,
} from "@/engine/scheduler_types.js";
import { assertNever } from "@/lib/assert_never.js";
import type { NodeRunStatusName } from "@/shared/events.js";
import type { FlowGraph } from "@/shared/flow_graph.js";

export function createScheduler(
    graph: FlowGraph,
    run: RunState,
    options: SchedulerOptions,
    restore?: SchedulerSnapshot,
): Scheduler {
    const state = restore ? restoreSnapshot(restore) : { run, nodeRuns: [] };

    return new DagScheduler(new FlowPlan(graph), options, state);
}

class DagScheduler implements Scheduler {
    private readonly nodeRuns: NodeRunRegistry;
    private run: RunState;
    private items: WorkItemRef[] | undefined;
    private readonly agentStarts: AgentStartPacer;
    private stopOutcome: StopOutcome | undefined;
    private outbox: SchedulerCommand[] = [];

    constructor(
        private readonly plan: FlowPlan,
        private readonly options: SchedulerOptions,
        state: SchedulerState,
    ) {
        this.nodeRuns = new NodeRunRegistry(state.nodeRuns);
        this.run = state.run;
        this.items = state.items;
        this.agentStarts = new AgentStartPacer(options, state.lastAgentStartAt);
        this.stopOutcome = state.stopOutcome;
    }

    handle(event: SchedulerEvent): SchedulerCommand[] {
        switch (event.type) {
            case "start":
                this.startRun(event.items, event.at);
                break;
            case "node_run_succeeded":
                this.succeedNodeRun(event.nodeRunId, event.outputs, event.at);
                break;
            case "node_run_failed":
                this.failNodeRun(event.nodeRunId, event.error, event.at);
                break;
            case "cancel_requested":
                this.cancelRun(event.at);
                break;
            default:
                assertNever(event);
        }

        return this.takeCommands();
    }

    tick(now: Date): SchedulerCommand[] {
        this.advance(now);

        return this.takeCommands();
    }

    snapshot(): SchedulerSnapshot {
        return takeSnapshot({
            run: this.run,
            nodeRuns: this.nodeRuns.all(),
            items: this.items,
            lastAgentStartAt: this.agentStarts.lastAgentStartAt,
            stopOutcome: this.stopOutcome,
        });
    }

    private startRun(items: WorkItemRef[], at: Date): void {
        this.changeRun(transitionRun(this.run, "RUNNING", at));
        this.createPendingNodeRuns(this.plan.nodeIdsOfScope("run"), undefined);
        for (const triggerNodeId of this.plan.triggerNodeIds()) {
            this.succeedTrigger(triggerNodeId, items, at);
        }

        this.advance(at);
    }

    // The trigger has nothing to execute: its output is the item list of the start event.
    private succeedTrigger(triggerNodeId: string, items: WorkItemRef[], at: Date): void {
        const pending = this.nodeRuns.find(triggerNodeId, undefined);
        if (!pending) {
            return;
        }

        const queued = transitionNodeRun(pending, "QUEUED", at);
        const running = transitionNodeRun(queued, "RUNNING", at, { inputs: {} });
        const outputs = { [TRIGGER_ITEMS_PORT]: items };
        this.changeNodeRun(transitionNodeRun(running, "SUCCEEDED", at, { outputs }));
        this.fanOutItems(triggerNodeId, outputs);
    }

    private succeedNodeRun(nodeRunId: string, outputs: Record<string, unknown>, at: Date): void {
        const nodeRun = this.nodeRuns.get(nodeRunId);
        this.changeNodeRun(transitionNodeRun(nodeRun, "SUCCEEDED", at, { outputs }));
        this.fanOutItems(nodeRun.nodeId, outputs);

        this.advance(at);
    }

    private failNodeRun(nodeRunId: string, error: NodeRunError | undefined, at: Date): void {
        const nodeRun = this.nodeRuns.get(nodeRunId);
        const status = error?.kind === "canceled" ? "CANCELED" : "FAILED";
        this.changeNodeRun(transitionNodeRun(nodeRun, status, at, { error }));
        if (!this.stopOutcome) {
            this.stop("FAILED", at);
        }

        this.advance(at);
    }

    private cancelRun(at: Date): void {
        if (RUN_TERMINAL.has(this.run.status)) {
            return;
        }
        if (this.run.status === "QUEUED") {
            this.changeRun(transitionRun(this.run, "CANCELED", at));
            return;
        }

        this.stop("CANCELED", at);
        for (const nodeRun of this.nodeRuns.withStatus("RUNNING")) {
            this.outbox.push({ type: "cancel_node_run", nodeRunId: nodeRun.id });
        }

        this.advance(at);
    }

    // Nothing new starts once the run is stopping; RUNNING NodeRuns are left to finish.
    private stop(outcome: StopOutcome, at: Date): void {
        this.stopOutcome = outcome;
        for (const nodeRun of this.nodeRuns.withStatus("PENDING", "QUEUED")) {
            this.changeNodeRun(transitionNodeRun(nodeRun, "CANCELED", at));
        }
    }

    // The first list that reaches the item path defines the items of the run.
    private fanOutItems(nodeId: string, outputs: Record<string, unknown>): void {
        const splittingEdge = this.plan.findEdgeSplittingListIntoItems(nodeId);
        if (!splittingEdge || this.items || this.stopOutcome) {
            return;
        }

        const listOutput = outputs[splittingEdge.from.port];
        this.items = Array.isArray(listOutput) ? listOutput.filter(isWorkItemRef) : [];
        for (const item of this.items) {
            this.createPendingNodeRuns(this.plan.nodeIdsOfScope("item"), item.id);
        }
    }

    private createPendingNodeRuns(nodeIds: string[], workItemId: string | undefined): void {
        for (const nodeId of nodeIds) {
            this.changeNodeRun({
                id: this.options.newId(),
                runId: this.run.id,
                nodeId,
                workItemId,
                iteration: 0,
                attempt: 1,
                groupPath: [],
                status: "PENDING",
            });
        }
    }

    private advance(now: Date): void {
        if (this.run.status !== "RUNNING") {
            return;
        }

        this.queueReadyNodeRuns(now);
        this.startQueuedNodeRuns(now);
        this.scheduleWakeupForWaitingAgents(now);
        this.finishRunWhenSettled(now);
    }

    // In DAG order, so a skip cascades to the downstream NodeRuns in the same pass.
    private queueReadyNodeRuns(at: Date): void {
        const pendingInDagOrder = this.nodeRuns
            .withStatus("PENDING")
            .sort((a, b) => this.plan.dagPositionOf(a.nodeId) - this.plan.dagPositionOf(b.nodeId));
        for (const nodeRun of pendingInDagOrder) {
            this.queueOrSkipByInputs(nodeRun, at);
        }
    }

    private queueOrSkipByInputs(nodeRun: NodeRunState, at: Date): void {
        const resolution = this.resolveInputsOf(nodeRun);
        switch (resolution.kind) {
            case "waiting":
                break;
            case "skip":
                this.changeNodeRun(transitionNodeRun(nodeRun, "SKIPPED", at));
                break;
            case "ready":
                this.changeNodeRun(transitionNodeRun(nodeRun, "QUEUED", at));
                break;
            default:
                assertNever(resolution);
        }
    }

    private startQueuedNodeRuns(now: Date): void {
        const queueInStartOrder = this.nodeRuns
            .withStatus("QUEUED")
            .sort((a, b) => compareQueueOrder(this.queuePositionOf(a), this.queuePositionOf(b)));
        for (const nodeRun of queueInStartOrder) {
            if (this.plan.isLimitedByConcurrency(nodeRun.nodeId)) {
                this.startAgentWhenAllowed(nodeRun, now);
            } else {
                this.startNodeRun(nodeRun, now);
            }
        }
    }

    private startAgentWhenAllowed(nodeRun: NodeRunState, now: Date): void {
        const runningAgentCount = this.agentNodeRunsWithStatus("RUNNING").length;
        if (!this.agentStarts.canStart(now, runningAgentCount)) {
            return;
        }

        this.startNodeRun(nodeRun, now);
        this.agentStarts.recordStart(now);
    }

    private startNodeRun(nodeRun: NodeRunState, now: Date): void {
        const resolution = this.resolveInputsOf(nodeRun);
        const inputs = resolution.kind === "ready" ? resolution.inputs : {};
        const running = transitionNodeRun(nodeRun, "RUNNING", now, { inputs });
        this.changeNodeRun(running);
        this.outbox.push({ type: "start_node_run", nodeRun: running, inputs });
    }

    private scheduleWakeupForWaitingAgents(now: Date): void {
        const hasWaitingAgent = this.agentNodeRunsWithStatus("QUEUED").length > 0;
        const nextStartTime = this.agentStarts.findNextStartTime(now);
        if (!hasWaitingAgent || !nextStartTime) {
            return;
        }

        this.outbox.push({ type: "schedule_wakeup", at: nextStartTime });
    }

    private finishRunWhenSettled(at: Date): void {
        if (this.nodeRuns.areAllTerminal()) {
            this.changeRun(transitionRun(this.run, this.stopOutcome ?? "SUCCEEDED", at));
        }
    }

    private resolveInputsOf(nodeRun: NodeRunState): InputResolution {
        const node = this.plan.findNode(nodeRun.nodeId);
        if (!node) {
            return { kind: "skip" };
        }

        return resolveInputs(
            this.plan.graph,
            { node, workItemId: nodeRun.workItemId },
            {
                items: this.items,
                scopeOf: (nodeId) => this.plan.scopeOf(nodeId),
                findNodeRun: (nodeId, workItemId) => this.nodeRuns.find(nodeId, workItemId),
            },
        );
    }

    private queuePositionOf(nodeRun: NodeRunState): QueuePosition {
        return {
            queuedAtMs: nodeRun.queuedAt?.getTime() ?? 0,
            dagPosition: this.plan.dagPositionOf(nodeRun.nodeId),
            workItemId: nodeRun.workItemId,
        };
    }

    private agentNodeRunsWithStatus(status: NodeRunStatusName): NodeRunState[] {
        return this.nodeRuns
            .withStatus(status)
            .filter((nodeRun) => this.plan.isLimitedByConcurrency(nodeRun.nodeId));
    }

    private changeNodeRun(nodeRun: NodeRunState): void {
        this.nodeRuns.save(nodeRun);
        this.outbox.push({ type: "node_run_changed", nodeRun });
    }

    private changeRun(run: RunState): void {
        this.run = run;
        this.outbox.push({ type: "run_changed", run });
    }

    private takeCommands(): SchedulerCommand[] {
        const commands = this.outbox;
        this.outbox = [];

        return commands;
    }
}

function isWorkItemRef(candidate: unknown): candidate is WorkItemRef {
    return (
        typeof candidate === "object" &&
        candidate !== null &&
        "id" in candidate &&
        typeof candidate.id === "string"
    );
}
