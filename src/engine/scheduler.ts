import { AgentStartPacer } from "@/engine/agent_start_pacer.js";
import { FlowPlan } from "@/engine/flow_plan.js";
import { LoopGroupCoordinator } from "@/engine/loop_group_coordinator.js";
import type { MapGroupState } from "@/engine/map_group.js";
import { type FinishedMapItem, MapGroupCoordinator } from "@/engine/map_group_coordinator.js";
import { type InputResolution, resolveInputs } from "@/engine/node_inputs.js";
import { NodeRunRegistry } from "@/engine/node_run_registry.js";
import {
    NODE_RUN_TERMINAL,
    type NodeRunError,
    type NodeRunState,
    transitionNodeRun,
} from "@/engine/node_run_state.js";
import { NodeRunTimeouts, TIMEOUT_TOTAL_ERROR } from "@/engine/node_run_timeouts.js";
import { decideRetry, type FailureKind } from "@/engine/retry_policy.js";
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
    private readonly mapGroups: MapGroupCoordinator;
    private readonly loops: LoopGroupCoordinator;
    private run: RunState;
    private items: WorkItemRef[] | undefined;
    private readonly agentStarts: AgentStartPacer;
    private readonly timeouts: NodeRunTimeouts;
    private stopOutcome: StopOutcome | undefined;
    private outbox: SchedulerCommand[] = [];

    constructor(
        private readonly plan: FlowPlan,
        private readonly options: SchedulerOptions,
        state: SchedulerState,
    ) {
        this.nodeRuns = new NodeRunRegistry(state.nodeRuns);
        this.mapGroups = new MapGroupCoordinator({
            plan,
            nodeRuns: this.nodeRuns,
            savedStates: state.mapGroups ?? [],
            createPendingNodeRuns: (nodeIds, itemId) => this.createPendingNodeRuns(nodeIds, itemId),
            emit: (command) => this.outbox.push(command),
        });
        this.loops = new LoopGroupCoordinator({
            plan,
            nodeRuns: this.nodeRuns,
            savedStates: state.loopInstances ?? [],
            createPendingNodeRuns: (nodeIds, itemId) => this.createPendingNodeRuns(nodeIds, itemId),
            isRunStopping: () => this.stopOutcome !== undefined,
        });
        this.run = state.run;
        this.items = state.items;
        this.agentStarts = new AgentStartPacer(options, state.lastAgentStartAt);
        this.timeouts = new NodeRunTimeouts(plan, state.timedOutNodeRunIds ?? []);
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
            case "cancel_node_run_requested":
                this.cancelNodeRun(event.nodeRunId, event.at);
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
            mapGroups: this.mapGroups.states(),
            loopInstances: this.loops.states(),
            lastAgentStartAt: this.agentStarts.lastAgentStartAt,
            stopOutcome: this.stopOutcome,
            timedOutNodeRunIds: this.timeouts.timedOutIds(),
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
        const recordedError = this.recordedErrorOf(nodeRun, error);
        const failureKind: FailureKind = recordedError?.kind ?? "runtime";
        const status = failureKind === "canceled" ? "CANCELED" : "FAILED";
        const failed = transitionNodeRun(nodeRun, status, at, { error: recordedError });
        this.changeNodeRun(failed);
        const retryDelayMs = this.findRetryDelayMs(failed, failureKind);
        if (retryDelayMs === undefined) {
            this.giveUpOn(failed, at);
        } else {
            this.queueNextAttempt(failed, new Date(at.getTime() + retryDelayMs));
        }

        this.advance(at);
    }

    // The cancel the scheduler asked for an overdue NodeRun comes back as a plain cancel.
    private recordedErrorOf(
        nodeRun: NodeRunState,
        error: NodeRunError | undefined,
    ): NodeRunError | undefined {
        if (error?.kind === "canceled" && this.timeouts.hasTimedOut(nodeRun.id)) {
            return TIMEOUT_TOTAL_ERROR;
        }

        return error;
    }

    // Undefined when the NodeRun fails for good.
    private findRetryDelayMs(failed: NodeRunState, failureKind: FailureKind): number | undefined {
        if (this.stopOutcome) {
            return undefined;
        }

        const maxRetries = this.plan.maxRetriesOf(failed.nodeId);
        const decision = decideRetry(failureKind, failed.attempt, maxRetries);

        return decision.retry ? decision.delayMs : undefined;
    }

    // Inside a map the failure belongs to the item: applyFinishedItem decides what it stops.
    private giveUpOn(failed: NodeRunState, at: Date): void {
        if (!this.stopOutcome && !this.plan.mapGroupIdOf(failed.nodeId)) {
            this.stop("FAILED", at);
        }
    }

    // The failed NodeRun stays in the history; the next attempt only starts once its queuedAt comes.
    private queueNextAttempt(failed: NodeRunState, queuedAt: Date): void {
        this.changeNodeRun(transitionNodeRun(this.nextAttemptOf(failed), "QUEUED", queuedAt));
        this.outbox.push({ type: "schedule_wakeup", at: queuedAt });
    }

    private nextAttemptOf(previous: NodeRunState): NodeRunState {
        return {
            id: this.options.newId(),
            runId: previous.runId,
            nodeId: previous.nodeId,
            workItemId: previous.workItemId,
            iteration: previous.iteration,
            attempt: previous.attempt + 1,
            groupPath: previous.groupPath,
            status: "PENDING",
        };
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
        this.requestCancel(this.nodeRuns.withStatus("RUNNING"));

        this.advance(at);
    }

    // Inside a map only the item fails; anywhere else the run cannot go on without the NodeRun.
    private cancelNodeRun(nodeRunId: string, at: Date): void {
        const nodeRun = this.nodeRuns.get(nodeRunId);
        if (NODE_RUN_TERMINAL.has(nodeRun.status)) {
            return;
        }
        if (!this.plan.mapGroupIdOf(nodeRun.nodeId)) {
            this.cancelRun(at);
            return;
        }

        if (nodeRun.status === "RUNNING") {
            this.requestCancel([nodeRun]);
        } else {
            this.changeNodeRun(transitionNodeRun(nodeRun, "CANCELED", at));
        }

        this.advance(at);
    }

    // Nothing new starts once the run is stopping; RUNNING NodeRuns are left to finish.
    private stop(outcome: StopOutcome, at: Date): void {
        this.stopOutcome = outcome;
        for (const nodeRun of this.nodeRuns.withStatus("PENDING", "QUEUED")) {
            this.changeNodeRun(transitionNodeRun(nodeRun, "CANCELED", at));
        }
        this.mapGroups.cancelQueuedItems();
    }

    private requestCancel(runningNodeRuns: NodeRunState[]): void {
        for (const nodeRun of runningNodeRuns) {
            this.outbox.push({ type: "cancel_node_run", nodeRunId: nodeRun.id });
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
            this.createPendingNodeRuns(this.plan.itemNodeIdsOutsideMaps(), item.id);
        }
        this.mapGroups.feedItemList(this.items.map((item) => item.id));
    }

    private createPendingNodeRuns(nodeIds: string[], workItemId: string | undefined): void {
        this.loops.startLoopsOf(nodeIds, workItemId);
        for (const nodeId of nodeIds) {
            this.changeNodeRun({
                id: this.options.newId(),
                runId: this.run.id,
                nodeId,
                workItemId,
                iteration: this.loops.iterationOf(nodeId, workItemId),
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

        this.cancelOverdueNodeRuns(now);
        this.moveItemsThroughGroups(now);
        this.startQueuedNodeRuns(now);
        this.scheduleWakeupForWaitingAgents(now);
        this.finishRunWhenSettled(now);
    }

    private cancelOverdueNodeRuns(now: Date): void {
        this.requestCancel(this.timeouts.markOverdue(this.nodeRuns.withStatus("RUNNING"), now));
    }

    // Repeats until stable: a finished loop iteration may start the next one or release the loop's
    // exits; a finished item frees a slot and may feed the next map, whose new NodeRuns may be
    // skipped right away and finish their item too.
    private moveItemsThroughGroups(at: Date): void {
        let hasProgress = true;
        while (hasProgress) {
            this.admitQueuedMapItems();
            this.queueReadyNodeRuns(at);
            const hasFinishedIterations = this.loops.finishSettledIterations();
            const finishedItems = this.mapGroups.finishSettledItems();
            for (const finished of finishedItems) {
                this.applyFinishedItem(finished, at);
            }
            const hasReceivedItems = this.feedCorrelatedMaps();
            hasProgress = hasFinishedIterations || finishedItems.length > 0 || hasReceivedItems;
        }
    }

    private admitQueuedMapItems(): void {
        if (!this.stopOutcome) {
            this.mapGroups.admitQueuedItems();
        }
    }

    private feedCorrelatedMaps(): boolean {
        if (this.stopOutcome) {
            return false;
        }

        return this.mapGroups.feedCorrelatedMaps();
    }

    private applyFinishedItem(finished: FinishedMapItem, at: Date): void {
        if (this.hasItemFailedByItself(finished)) {
            this.recordFailedItem(finished.itemId);
        }
        if (finished.result === "failed" && finished.mapGroup.failFast) {
            this.stopOnFailedItem(finished.mapGroup, at);
        }
    }

    // Items canceled because the run is stopping did not fail by themselves; a NodeRun the user
    // canceled does fail its item.
    private hasItemFailedByItself(finished: FinishedMapItem): boolean {
        return finished.hasFailedNodeRun || (finished.result === "failed" && !this.stopOutcome);
    }

    private recordFailedItem(itemId: string): void {
        this.changeRun({ ...this.run, failedItems: [...(this.run.failedItems ?? []), itemId] });
    }

    // Acts on the first failure only: the canceled items that follow also finish as failed.
    private stopOnFailedItem(failFastMapGroup: MapGroupState, at: Date): void {
        if (this.stopOutcome) {
            return;
        }

        this.stop("FAILED", at);
        this.requestCancel(this.mapGroups.runningNodeRunsOf(failFastMapGroup));
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
        const queueInStartOrder = this.dueQueuedNodeRuns(now).sort((a, b) =>
            compareQueueOrder(this.queuePositionOf(a), this.queuePositionOf(b)),
        );
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
        this.scheduleWakeupAtDeadline(running);
    }

    private scheduleWakeupAtDeadline(running: NodeRunState): void {
        const deadline = this.timeouts.deadlineOf(running);
        if (deadline) {
            this.outbox.push({ type: "schedule_wakeup", at: deadline });
        }
    }

    private scheduleWakeupForWaitingAgents(now: Date): void {
        const hasWaitingAgent = this.dueQueuedNodeRuns(now).some((nodeRun) =>
            this.plan.isLimitedByConcurrency(nodeRun.nodeId),
        );
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
                mapGroupOf: (nodeId) => this.mapGroups.mapGroupOf(nodeId),
                loops: this.loops,
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

    // A retry waits in the queue until its queuedAt.
    private dueQueuedNodeRuns(now: Date): NodeRunState[] {
        return this.nodeRuns
            .withStatus("QUEUED")
            .filter((nodeRun) => (nodeRun.queuedAt?.getTime() ?? 0) <= now.getTime());
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
