import { AgentStartPacer } from "@/engine/agent_start_pacer.js";
import { ApprovalDeadlines } from "@/engine/approval_deadlines.js";
import type { RunBudget, UsageTotals } from "@/engine/budgets.js";
import { FlowPlan } from "@/engine/flow_plan.js";
import {
    APPROVAL_TIMEOUT_COMMENT,
    gateOutputsOf,
    isAwaitingDecision,
} from "@/engine/gate_decision.js";
import { LoopGroupCoordinator } from "@/engine/loop_group_coordinator.js";
import type { MapGroupState } from "@/engine/map_group.js";
import { type FinishedMapItem, MapGroupCoordinator } from "@/engine/map_group_coordinator.js";
import { type InputResolution, resolveInputs } from "@/engine/node_inputs.js";
import { NodeRunRegistry } from "@/engine/node_run_registry.js";
import {
    createNextAttempt,
    NODE_RUN_TERMINAL,
    type NodeRunError,
    type NodeRunState,
    requeueSameAttempt,
    transitionNodeRun,
} from "@/engine/node_run_state.js";
import { NodeRunTimeouts, TIMEOUT_TOTAL_ERROR } from "@/engine/node_run_timeouts.js";
import {
    canRetryOnRequest,
    decideRetry,
    type RecordedFailure,
    shouldRecalculateAfterRetry,
} from "@/engine/retry_policy.js";
import {
    type BudgetBreach,
    budgetExceededError,
    RunBudgetGuard,
} from "@/engine/run_budget_guard.js";
import { canReopenRun, RUN_TERMINAL, type RunState, transitionRun } from "@/engine/run_state.js";
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
import { computeResumeAt } from "@/engine/usage_pause.js";
import { collectUpstreamOutputs } from "@/engine/upstream_outputs.js";
import { assertNever } from "@/lib/assert_never.js";
import type { ApprovalDecision } from "@/shared/approval_types.js";
import type { NodeOutputsBySlug } from "@/shared/data_context.js";
import type { NodeRunStatusName } from "@/shared/events.js";
import type { FlowGraph } from "@/shared/flow_graph.js";

type NodeRunFailure = Extract<SchedulerEvent, { type: "node_run_failed" }>;
type ApprovalResolution = Extract<SchedulerEvent, { type: "approval_resolved" }>;

// A failure event that brings no error is treated as a runtime failure.
const UNREPORTED_FAILURE: RecordedFailure = { kind: "runtime" };

const INTERRUPTED_BY_RESTART: NodeRunError = {
    kind: "interrupted",
    message: "Interrompido pelo reinício do servidor",
};

interface QueuedAgentOverBudget {
    nodeRun: NodeRunState;
    breach: BudgetBreach;
}

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
    private readonly budget: RunBudgetGuard;
    private readonly approvalDeadlines: ApprovalDeadlines;
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
        this.budget = new RunBudgetGuard(options.budget, state.usageByNode ?? {});
        this.approvalDeadlines = new ApprovalDeadlines(state.approvalDeadlines ?? {});
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
                this.failNodeRun(event);
                break;
            case "cancel_requested":
                this.cancelRun(event.at);
                break;
            case "pause_requested":
                this.pauseForUser(event.at);
                break;
            case "resume_requested":
                this.resumeForUser(event.at);
                break;
            case "cancel_node_run_requested":
                this.cancelNodeRun(event.nodeRunId, event.at);
                break;
            case "retry_node_run_requested":
                this.retryNodeRun(event.nodeRunId, event.at);
                break;
            case "usage_recorded":
                this.recordUsage(event.nodeRunId, { costUsd: event.costUsd, tokens: event.tokens });
                break;
            case "budget_raised":
                this.raiseBudget(event.budget, event.at);
                break;
            case "node_run_interrupted":
                this.interruptNodeRun(event.nodeRunId, event.at);
                break;
            case "node_run_waiting_approval":
                this.waitForApproval(event.nodeRunId, event.expiresAt, event.at);
                break;
            case "approval_resolved":
                this.resolveApproval(event);
                break;
            default:
                assertNever(event);
        }

        return this.takeCommands();
    }

    tick(now: Date): SchedulerCommand[] {
        this.resumeWhenUsageLimitResets(now);
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
            usageByNode: this.budget.spentByNode(),
            approvalDeadlines: this.approvalDeadlines.toRecord(),
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

    private failNodeRun(failure: NodeRunFailure): void {
        if (this.shouldWaitForUsageLimit(failure)) {
            this.waitForUsageLimitReset(failure);
        } else {
            this.recordFailure(failure.nodeRunId, failure.error, failure.at);
        }

        this.advance(failure.at);
    }

    // A run that is already stopping has nothing to wait for: the NodeRun just fails.
    private shouldWaitForUsageLimit(failure: NodeRunFailure): boolean {
        return failure.error?.kind === "usage_limit" && !this.stopOutcome;
    }

    // The limit belongs to the account, so the whole run waits; it is not a failed attempt.
    private waitForUsageLimitReset({ nodeRunId, error, resetAt, at }: NodeRunFailure): void {
        const nodeRun = this.nodeRuns.get(nodeRunId);
        this.changeNodeRun(transitionNodeRun(nodeRun, "WAITING_LIMIT", at, { error }));
        const resumeAt = computeResumeAt(at, resetAt, this.options.usageLimitMarginMinutes);
        if (this.isPausedByUsageLimit()) {
            this.postponeResume(resumeAt);
            return;
        }

        this.pauseForUsageLimit(resetAt, resumeAt, at);
    }

    // The later reset wins: resuming at the earlier one would only hit the limit again.
    private postponeResume(resumeAt: Date): void {
        const currentResumeAtMs = this.run.resumeAt?.getTime() ?? 0;
        if (resumeAt.getTime() <= currentResumeAtMs) {
            return;
        }

        this.changeRun({ ...this.run, resumeAt });
        this.outbox.push({ type: "schedule_wakeup", at: resumeAt });
    }

    private pauseForUsageLimit(resetAt: Date | undefined, resumeAt: Date, at: Date): void {
        this.changeRun(this.runPausedByUsageLimit(resumeAt, at));
        this.outbox.push({ type: "usage_limit_reached", resetAt, resumeAt });
        this.outbox.push({ type: "schedule_wakeup", at: resumeAt });
    }

    // The budget is checked again before each agent starts, so its pause can give way to the limit.
    private runPausedByUsageLimit(resumeAt: Date, at: Date): RunState {
        const usageLimitPause: Partial<RunState> = { pauseReason: "usage_limit", resumeAt };
        if (this.isPausedByBudget()) {
            return { ...this.run, ...usageLimitPause };
        }

        return transitionRun(this.run, "PAUSED", at, usageLimitPause);
    }

    private recordFailure(nodeRunId: string, error: NodeRunError | undefined, at: Date): void {
        const nodeRun = this.nodeRuns.get(nodeRunId);
        const recordedError = this.recordedErrorOf(nodeRun, error);
        const failure: RecordedFailure = recordedError ?? UNREPORTED_FAILURE;
        const status = failure.kind === "canceled" ? "CANCELED" : "FAILED";
        const failed = transitionNodeRun(nodeRun, status, at, { error: recordedError });
        this.changeNodeRun(failed);
        this.retryOrGiveUp(failed, failure, at);
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

    private retryOrGiveUp(failed: NodeRunState, failure: RecordedFailure, at: Date): void {
        const retryDelayMs = this.findRetryDelayMs(failed, failure);
        if (retryDelayMs === undefined) {
            this.giveUpOn(failed, at);
            return;
        }

        this.queueNextAttempt(failed, new Date(at.getTime() + retryDelayMs));
    }

    // Undefined when the NodeRun fails for good.
    private findRetryDelayMs(failed: NodeRunState, failure: RecordedFailure): number | undefined {
        if (this.stopOutcome) {
            return undefined;
        }

        const maxRetries = this.plan.maxRetriesOf(failed.nodeId);
        const decision = decideRetry(failure, failed.attempt, maxRetries);

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
        return createNextAttempt(previous, this.options.newId());
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
            this.cancelBeforeFinishing(nodeRun, at);
        }

        this.advance(at);
    }

    // Reruns the NodeRun and whatever of its item it had kept from running, and nothing else.
    private retryNodeRun(nodeRunId: string, at: Date): void {
        const nodeRun = this.nodeRuns.get(nodeRunId);
        if (!this.canRetry(nodeRun)) {
            return;
        }

        this.reopenRunIfFinished(at);
        this.rerun(nodeRun);
        for (const blockedNodeRun of this.blockedDownstreamOf(nodeRun)) {
            this.rerun(blockedNodeRun);
        }
        this.forgetFailedItem(nodeRun.workItemId);

        this.advance(at);
    }

    // The trigger has nothing to execute, so there is nothing to retry.
    private canRetry(nodeRun: NodeRunState): boolean {
        if (!this.isLatestAttempt(nodeRun) || this.plan.isTrigger(nodeRun.nodeId)) {
            return false;
        }

        const isStopping = this.stopOutcome !== undefined;

        return canRetryOnRequest(nodeRun.status, { status: this.run.status, isStopping });
    }

    // Older attempts were already retried.
    private isLatestAttempt(nodeRun: NodeRunState): boolean {
        return this.nodeRuns.find(nodeRun.nodeId, nodeRun.workItemId)?.id === nodeRun.id;
    }

    private reopenRunIfFinished(at: Date): void {
        if (!canReopenRun(this.run.status)) {
            return;
        }

        this.stopOutcome = undefined;
        this.changeRun(transitionRun(this.run, "RUNNING", at));
    }

    private rerun(previous: NodeRunState): void {
        this.changeNodeRun(this.nextAttemptOf(previous));
        this.mapGroups.reopenItemOf(previous);
    }

    // The NodeRuns of the same item that did not run because of the retried one.
    private blockedDownstreamOf(nodeRun: NodeRunState): NodeRunState[] {
        return this.plan
            .downstreamNodeIdsOf(nodeRun.nodeId)
            .map((nodeId) => this.nodeRuns.find(nodeId, nodeRun.workItemId))
            .filter((downstream) => downstream !== undefined)
            .filter((downstream) => shouldRecalculateAfterRetry(downstream.status));
    }

    private forgetFailedItem(itemId: string | undefined): void {
        const failedItems = this.run.failedItems ?? [];
        if (itemId === undefined || !failedItems.includes(itemId)) {
            return;
        }

        const otherFailedItems = failedItems.filter((failedItem) => failedItem !== itemId);
        this.changeRun({ ...this.run, failedItems: otherFailedItems });
    }

    // A user pause takes over the limit and budget pauses, so only the user resumes the run.
    private pauseForUser(at: Date): void {
        if (this.run.status === "RUNNING") {
            this.changeRun(transitionRun(this.run, "PAUSED", at, { pauseReason: "user" }));
            return;
        }
        if (this.run.status !== "PAUSED" || this.isPausedByUser()) {
            return;
        }

        const pausedByUser: RunState = { ...this.run, pauseReason: "user" };
        delete pausedByUser.resumeAt;
        this.changeRun(pausedByUser);
    }

    // The budget is checked again as the NodeRuns start, so it may pause the run once more.
    private resumeForUser(at: Date): void {
        if (!this.isPausedByUser()) {
            return;
        }

        this.requeueNodeRunsWaitingForLimit(at);
        this.changeRun(transitionRun(this.run, "RUNNING", at));
        this.advance(at);
    }

    private requeueNodeRunsWaitingForLimit(at: Date): void {
        for (const waiting of this.nodeRuns.withStatus("WAITING_LIMIT")) {
            this.changeNodeRun(requeueSameAttempt(waiting, at));
        }
    }

    private recordUsage(nodeRunId: string, usage: UsageTotals): void {
        this.budget.recordUsage(this.nodeRuns.get(nodeRunId).nodeId, usage);
    }

    private resumeWhenUsageLimitResets(now: Date): void {
        if (!this.hasUsageLimitReset(now)) {
            return;
        }

        this.outbox.push({ type: "usage_limit_reset" });
        this.requeueNodeRunsWaitingForLimit(now);
        this.changeRun(transitionRun(this.run, "RUNNING", now));
    }

    // Only a pause that is still the limit's: a user pause taken meanwhile keeps the run paused.
    private hasUsageLimitReset(now: Date): boolean {
        const { resumeAt } = this.run;
        if (!this.isPausedByUsageLimit() || !resumeAt) {
            return false;
        }

        return resumeAt.getTime() <= now.getTime();
    }

    private raiseBudget(budget: RunBudget, at: Date): void {
        this.budget.replaceBudget(budget);
        if (!this.isPausedByBudget()) {
            return;
        }

        this.changeRun(transitionRun(this.run, "RUNNING", at));
        this.advance(at);
    }

    // Not a failed attempt: the same attempt starts over, on the same branch.
    private interruptNodeRun(nodeRunId: string, at: Date): void {
        const nodeRun = this.nodeRuns.get(nodeRunId);
        if (nodeRun.status !== "RUNNING") {
            return;
        }

        const interrupted = transitionNodeRun(nodeRun, "INTERRUPTED", at, {
            error: INTERRUPTED_BY_RESTART,
        });
        this.changeNodeRun(interrupted);
        this.changeNodeRun(this.afterInterruption(interrupted, at));

        this.advance(at);
    }

    // A run that is stopping starts nothing new, so the interrupted NodeRun ends there.
    private afterInterruption(interrupted: NodeRunState, at: Date): NodeRunState {
        if (this.stopOutcome) {
            return transitionNodeRun(interrupted, "CANCELED", at);
        }

        return requeueSameAttempt(interrupted, at);
    }

    // The answer may come before the gate reports it is waiting; then there is nothing to wait for.
    private waitForApproval(nodeRunId: string, expiresAt: Date | undefined, at: Date): void {
        const gate = this.nodeRuns.get(nodeRunId);
        if (gate.status !== "RUNNING") {
            return;
        }
        if (this.stopOutcome) {
            this.cancelGateOfStoppingRun(gate, at);
            return;
        }

        this.changeNodeRun(transitionNodeRun(gate, "WAITING_APPROVAL", at));
        if (expiresAt) {
            this.approvalDeadlines.set(nodeRunId, expiresAt);
            this.outbox.push({ type: "schedule_wakeup", at: expiresAt });
        }
    }

    // The gate may have been the last NodeRun the stopping run was waiting for.
    private cancelGateOfStoppingRun(gate: NodeRunState, at: Date): void {
        this.withdrawApproval(gate.id);
        this.changeNodeRun(transitionNodeRun(gate, "CANCELED", at));
        this.advance(at);
    }

    private resolveApproval({ nodeRunId, decision, comment, at }: ApprovalResolution): void {
        const gate = this.nodeRuns.get(nodeRunId);
        if (!isAwaitingDecision(gate)) {
            return;
        }

        this.decideGate(gate, decision, comment, at);
        this.advance(at);
    }

    private expireOverdueApprovals(now: Date): void {
        for (const nodeRunId of this.approvalDeadlines.overdueNodeRunIds(now)) {
            this.outbox.push({ type: "expire_approval", nodeRunId });
            const gate = this.nodeRuns.get(nodeRunId);
            this.decideGate(gate, "rejected", APPROVAL_TIMEOUT_COMMENT, now);
        }
    }

    private decideGate(
        gate: NodeRunState,
        decision: ApprovalDecision,
        comment: string | undefined,
        at: Date,
    ): void {
        this.approvalDeadlines.forget(gate.id);
        const outputs = gateOutputsOf(gate, decision, comment);
        this.changeNodeRun(transitionNodeRun(gate, "SUCCEEDED", at, { outputs }));
    }

    // Nothing new starts once the run is stopping; RUNNING NodeRuns are left to finish.
    private stop(outcome: StopOutcome, at: Date): void {
        this.stopOutcome = outcome;
        const notRunning = this.nodeRuns.withStatus(
            "PENDING",
            "QUEUED",
            "WAITING_LIMIT",
            "WAITING_APPROVAL",
        );
        for (const nodeRun of notRunning) {
            this.cancelBeforeFinishing(nodeRun, at);
        }
        this.mapGroups.cancelQueuedItems();
    }

    private cancelBeforeFinishing(nodeRun: NodeRunState, at: Date): void {
        if (nodeRun.status === "WAITING_APPROVAL") {
            this.withdrawApproval(nodeRun.id);
        }

        this.changeNodeRun(transitionNodeRun(nodeRun, "CANCELED", at));
    }

    // A gate canceled while it waits leaves an approval nobody can answer anymore.
    private withdrawApproval(nodeRunId: string): void {
        this.approvalDeadlines.forget(nodeRunId);
        this.outbox.push({ type: "expire_approval", nodeRunId });
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
        if (!this.isRunGoingOn()) {
            return;
        }

        this.expireOverdueApprovals(now);
        this.cancelOverdueNodeRuns(now);
        this.moveItemsThroughGroups(now);
        // The budget may have paused the run while the NodeRuns were being queued.
        if (!this.isRunGoingOn()) {
            return;
        }

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
            this.enforceBudgetOnQueuedAgents(at);
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

    // Called while moving items through groups so that a budget failure inside a map settles its
    // item in the same pass.
    private enforceBudgetOnQueuedAgents(now: Date): void {
        let overBudget = this.findQueuedAgentOverBudget(now);
        while (overBudget) {
            this.applyBudgetBreach(overBudget.nodeRun, overBudget.breach, now);
            overBudget = this.findQueuedAgentOverBudget(now);
        }
    }

    private findQueuedAgentOverBudget(now: Date): QueuedAgentOverBudget | undefined {
        if (!this.isRunGoingOn()) {
            return undefined;
        }

        for (const nodeRun of this.dueQueuedAgents(now)) {
            const breach = this.budget.findBreachFor(nodeRun.nodeId);
            if (breach) {
                return { nodeRun, breach };
            }
        }

        return undefined;
    }

    private applyBudgetBreach(nodeRun: NodeRunState, breach: BudgetBreach, at: Date): void {
        switch (breach.onExceeded) {
            case "pause":
                this.changeRun(transitionRun(this.run, "PAUSED", at, { pauseReason: "budget" }));
                break;
            case "fail":
                this.failBeforeStart(nodeRun, budgetExceededError(breach.scope), at);
                break;
            default:
                assertNever(breach.onExceeded);
        }
    }

    private failBeforeStart(queued: NodeRunState, error: NodeRunError, at: Date): void {
        const failed = transitionNodeRun(queued, "FAILED", at, { error });
        this.changeNodeRun(failed);
        this.retryOrGiveUp(failed, error, at);
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
        const upstreamOutputs = this.collectUpstreamOutputsOf(running);
        this.outbox.push({ type: "start_node_run", nodeRun: running, inputs, upstreamOutputs });
        this.scheduleWakeupAtDeadline(running);
    }

    private scheduleWakeupAtDeadline(running: NodeRunState): void {
        const deadline = this.timeouts.deadlineOf(running);
        if (deadline) {
            this.outbox.push({ type: "schedule_wakeup", at: deadline });
        }
    }

    private scheduleWakeupForWaitingAgents(now: Date): void {
        const hasWaitingAgent = this.dueQueuedAgents(now).length > 0;
        const nextStartTime = this.agentStarts.findNextStartTime(now);
        if (!hasWaitingAgent || !nextStartTime) {
            return;
        }

        this.outbox.push({ type: "schedule_wakeup", at: nextStartTime });
    }

    private finishRunWhenSettled(at: Date): void {
        if (this.nodeRuns.areAllTerminal()) {
            this.changeRun(transitionRun(this.run, this.stopOutcome ?? this.settledOutcome(), at));
        }
    }

    // Some failed items still let the run succeed, as long as each map got at least one item
    // through. A map whose every item failed produced nothing, so the run failed.
    private settledOutcome(): "SUCCEEDED" | "FAILED" {
        return this.mapGroups.hasMapThatLostAllItems() ? "FAILED" : "SUCCEEDED";
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

    private collectUpstreamOutputsOf(nodeRun: NodeRunState): NodeOutputsBySlug {
        return collectUpstreamOutputs(
            this.plan.graph,
            nodeRun.nodeId,
            nodeRun.workItemId,
            (nodeId, workItemId) => this.nodeRuns.find(nodeId, workItemId),
        );
    }

    private queuePositionOf(nodeRun: NodeRunState): QueuePosition {
        return {
            queuedAtMs: queuedAtMsOf(nodeRun),
            dagPosition: this.plan.dagPositionOf(nodeRun.nodeId),
            workItemId: nodeRun.workItemId,
        };
    }

    // A retry waits in the queue until its queuedAt.
    private dueQueuedNodeRuns(now: Date): NodeRunState[] {
        return this.nodeRuns
            .withStatus("QUEUED")
            .filter((nodeRun) => queuedAtMsOf(nodeRun) <= now.getTime());
    }

    private dueQueuedAgents(now: Date): NodeRunState[] {
        return this.dueQueuedNodeRuns(now).filter((nodeRun) =>
            this.plan.isLimitedByConcurrency(nodeRun.nodeId),
        );
    }

    private agentNodeRunsWithStatus(status: NodeRunStatusName): NodeRunState[] {
        return this.nodeRuns
            .withStatus(status)
            .filter((nodeRun) => this.plan.isLimitedByConcurrency(nodeRun.nodeId));
    }

    private isRunGoingOn(): boolean {
        return this.run.status === "RUNNING";
    }

    private isPausedByUser(): boolean {
        return this.run.status === "PAUSED" && this.run.pauseReason === "user";
    }

    private isPausedByUsageLimit(): boolean {
        return this.run.status === "PAUSED" && this.run.pauseReason === "usage_limit";
    }

    private isPausedByBudget(): boolean {
        return this.run.status === "PAUSED" && this.run.pauseReason === "budget";
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

function queuedAtMsOf(nodeRun: NodeRunState): number {
    return nodeRun.queuedAt?.getTime() ?? 0;
}
