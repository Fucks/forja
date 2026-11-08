import type { RunBudget, UsageTotals } from "@/engine/budgets.js";
import { FlowPlan } from "@/engine/flow_plan.js";
import {
    NODE_RUN_TERMINAL,
    type NodeRunError,
    type NodeRunState,
} from "@/engine/node_run_state.js";
import type { RunState } from "@/engine/run_state.js";
import { createScheduler } from "@/engine/scheduler.js";
import type {
    Scheduler,
    SchedulerCommand,
    SchedulerEvent,
    SchedulerOptions,
    SchedulerSnapshot,
} from "@/engine/scheduler_types.js";
import type { CancelTimeout } from "@/lib/clock.js";
import { assertNever } from "@/lib/assert_never.js";
import { type Condition, evaluateCondition } from "@/shared/conditions.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { NodeRunStatusName } from "@/shared/events.js";
import { buildRunState } from "@/test/factories/run_state_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

export const DEFAULT_NODE_DURATION_MS = 1_000;
export const DEFAULT_USAGE_LIMIT_MARGIN_MINUTES = 5;
const ENOUGH_TIME_TO_FINISH_MS = 24 * 60 * 60 * 1_000;
const UNLIMITED_AGENTS = 100;
const CONDITION_INPUT_PORT = "value";
const CANCELED_BY_USER: NodeRunError = { kind: "canceled", message: "Cancelado pelo usuário" };
const USAGE_LIMIT_REACHED: NodeRunError = {
    kind: "usage_limit",
    message: "Limite de uso atingido",
};

export type NodeOutcome =
    | { kind: "succeed"; outputs: Record<string, unknown> }
    | { kind: "fail"; error: NodeRunError }
    | { kind: "hit_usage_limit"; resetAt?: Date };

export interface NodeBehavior {
    durationMs: number;
    outcome: NodeOutcome;
    // Reported just before the NodeRun finishes.
    usage?: UsageTotals;
}

export interface StartedNodeRun {
    nodeRun: NodeRunState;
    inputs: Record<string, unknown>;
}

type StartNodeRunCommand = Extract<SchedulerCommand, { type: "start_node_run" }>;
type GroupProgressCommand = Extract<SchedulerCommand, { type: "group_progress" }>;

export type NodeScript = (started: StartedNodeRun) => Partial<NodeBehavior>;

export interface SchedulerHarnessOptions {
    graph: FlowGraph;
    maxConcurrentAgents?: number;
    minStartIntervalMs?: number;
    scripts?: Record<string, NodeScript>;
    budget?: RunBudget;
}

export interface TimelineEntry {
    elapsedMs: number;
    nodeRunId: string;
    nodeId: string;
    workItemId?: string;
    attempt: number;
    status: NodeRunStatusName;
}

export function createSchedulerHarness(options: SchedulerHarnessOptions): SchedulerHarness {
    return new SchedulerHarness(options);
}

// Minimal in-memory executor: runs every started NodeRun on a FakeClock timer following the node's
// script, and records the NodeRun timeline that engine tests assert on.
export class SchedulerHarness {
    readonly clock: FakeClock;
    readonly timeline: TimelineEntry[] = [];
    readonly commands: SchedulerCommand[] = [];
    private currentRun: RunState;
    private scheduler: Scheduler;
    private readonly plan: FlowPlan;
    private readonly startedAtMs: number;
    private readonly runningTimers = new Map<string, CancelTimeout>();
    private nextNodeRunNumber = 1;

    constructor(private readonly options: SchedulerHarnessOptions) {
        this.clock = new FakeClock();
        this.startedAtMs = this.clock.now().getTime();
        this.plan = new FlowPlan(options.graph);
        this.currentRun = buildRunState();
        this.scheduler = this.createScheduler();
    }

    get run(): RunState {
        return this.currentRun;
    }

    start(workItemIds: string[]): void {
        const items = workItemIds.map((id) => ({ id }));
        this.deliver({ type: "start", items, at: this.clock.now() });
    }

    requestCancel(): void {
        this.deliver({ type: "cancel_requested", at: this.clock.now() });
    }

    requestNodeRunCancel(nodeRunId: string): void {
        this.deliver({ type: "cancel_node_run_requested", nodeRunId, at: this.clock.now() });
    }

    requestNodeRunRetry(nodeRunId: string): void {
        this.deliver({ type: "retry_node_run_requested", nodeRunId, at: this.clock.now() });
    }

    raiseBudget(budget: RunBudget): void {
        this.deliver({ type: "budget_raised", budget, at: this.clock.now() });
    }

    advance(ms: number): void {
        this.clock.advance(ms);
    }

    runToCompletion(): void {
        this.clock.advance(ENOUGH_TIME_TO_FINISH_MS);
    }

    snapshot(): SchedulerSnapshot {
        return this.scheduler.snapshot();
    }

    restartFromSnapshot(): void {
        const snapshot = structuredClone(this.scheduler.snapshot());
        this.scheduler = this.createScheduler(snapshot);
    }

    elapsedMsWhenRunFinished(): number | undefined {
        if (!this.run.finishedAt) {
            return undefined;
        }

        return this.run.finishedAt.getTime() - this.startedAtMs;
    }

    startCommandsOf(nodeId: string): StartNodeRunCommand[] {
        return this.commands.filter(
            (command): command is StartNodeRunCommand =>
                command.type === "start_node_run" && command.nodeRun.nodeId === nodeId,
        );
    }

    entriesOf(nodeId: string, workItemId?: string): TimelineEntry[] {
        return this.timeline.filter(
            (entry) => entry.nodeId === nodeId && entry.workItemId === workItemId,
        );
    }

    elapsedMsWhen(
        nodeId: string,
        workItemId: string | undefined,
        status: NodeRunStatusName,
    ): number | undefined {
        return this.entriesOf(nodeId, workItemId).find((entry) => entry.status === status)
            ?.elapsedMs;
    }

    // The last recorded entry of each NodeRun of the node, in creation order.
    attemptsOf(nodeId: string, workItemId?: string): TimelineEntry[] {
        const lastEntriesByNodeRunId = new Map<string, TimelineEntry>();
        for (const entry of this.entriesOf(nodeId, workItemId)) {
            lastEntriesByNodeRunId.set(entry.nodeRunId, entry);
        }

        return [...lastEntriesByNodeRunId.values()];
    }

    finalStatusOf(nodeId: string, workItemId?: string): NodeRunStatusName | undefined {
        return this.entriesOf(nodeId, workItemId).at(-1)?.status;
    }

    agentStartsInOrder(): TimelineEntry[] {
        return this.agentEntries().filter((entry) => entry.status === "RUNNING");
    }

    groupProgressOf(groupId: string): GroupProgressCommand[] {
        return this.commands.filter(
            (command): command is GroupProgressCommand =>
                command.type === "group_progress" && command.groupId === groupId,
        );
    }

    maxConcurrentRunningAgents(): number {
        return peakRunningCount(this.agentEntries());
    }

    maxConcurrentRunningOf(nodeId: string): number {
        return peakRunningCount(this.timeline.filter((entry) => entry.nodeId === nodeId));
    }

    private agentEntries(): TimelineEntry[] {
        return this.timeline.filter((entry) => this.isAgentNode(entry.nodeId));
    }

    private createScheduler(restore?: SchedulerSnapshot): Scheduler {
        const schedulerOptions: SchedulerOptions = {
            maxConcurrentAgents: this.options.maxConcurrentAgents ?? UNLIMITED_AGENTS,
            minStartIntervalMs: this.options.minStartIntervalMs ?? 0,
            newId: () => `nrn_${this.nextNodeRunNumber++}`,
            budget: this.options.budget,
            usageLimitMarginMinutes: DEFAULT_USAGE_LIMIT_MARGIN_MINUTES,
        };

        return createScheduler(this.options.graph, this.run, schedulerOptions, restore);
    }

    private deliver(event: SchedulerEvent): void {
        this.execute(this.scheduler.handle(event));
    }

    private execute(commands: SchedulerCommand[]): void {
        for (const command of commands) {
            this.commands.push(command);
            this.executeCommand(command);
        }
    }

    private executeCommand(command: SchedulerCommand): void {
        switch (command.type) {
            case "start_node_run":
                this.startNodeRun({ nodeRun: command.nodeRun, inputs: command.inputs });
                break;
            case "cancel_node_run":
                this.cancelNodeRun(command.nodeRunId);
                break;
            case "node_run_changed":
                this.record(command.nodeRun);
                break;
            case "run_changed":
                this.currentRun = command.run;
                break;
            case "schedule_wakeup":
                this.scheduleWakeup(command.at);
                break;
            case "group_progress":
            case "usage_limit_reached":
            case "usage_limit_reset":
                break;
            default:
                assertNever(command);
        }
    }

    private startNodeRun(started: StartedNodeRun): void {
        const behavior = this.behaviorOf(started);
        const finish = () => {
            this.runningTimers.delete(started.nodeRun.id);
            this.reportUsage(started.nodeRun.id, behavior.usage);
            this.deliver(finishingEvent(started.nodeRun.id, behavior.outcome, this.clock.now()));
        };
        this.runningTimers.set(
            started.nodeRun.id,
            this.clock.setTimeout(finish, behavior.durationMs),
        );
    }

    private reportUsage(nodeRunId: string, usage: UsageTotals | undefined): void {
        if (usage) {
            this.deliver({ type: "usage_recorded", nodeRunId, ...usage, at: this.clock.now() });
        }
    }

    private cancelNodeRun(nodeRunId: string): void {
        this.runningTimers.get(nodeRunId)?.();
        this.runningTimers.delete(nodeRunId);
        const canceled: NodeOutcome = { kind: "fail", error: CANCELED_BY_USER };
        this.clock.setTimeout(() => {
            this.deliver(finishingEvent(nodeRunId, canceled, this.clock.now()));
        }, 0);
    }

    private scheduleWakeup(at: Date): void {
        const delayMs = at.getTime() - this.clock.now().getTime();
        this.clock.setTimeout(() => this.execute(this.scheduler.tick(this.clock.now())), delayMs);
    }

    private behaviorOf(started: StartedNodeRun): NodeBehavior {
        const scripted = this.options.scripts?.[started.nodeRun.nodeId]?.(started) ?? {};

        return {
            durationMs: scripted.durationMs ?? DEFAULT_NODE_DURATION_MS,
            outcome: scripted.outcome ?? { kind: "succeed", outputs: this.defaultOutputs(started) },
            usage: scripted.usage,
        };
    }

    private defaultOutputs(started: StartedNodeRun): Record<string, unknown> {
        const node = this.plan.findNode(started.nodeRun.nodeId);
        if (node?.type === "condition") {
            return chooseConditionPort(node.config.condition, started.inputs);
        }

        const outputPorts = node?.outputs ?? [];
        const description = `${started.nodeRun.nodeId}/${started.nodeRun.workItemId ?? "run"}`;

        return Object.fromEntries(
            outputPorts.map((port) => [port.name, `${description}.${port.name}`]),
        );
    }

    private record(nodeRun: NodeRunState): void {
        this.timeline.push({
            elapsedMs: this.clock.now().getTime() - this.startedAtMs,
            nodeRunId: nodeRun.id,
            nodeId: nodeRun.nodeId,
            workItemId: nodeRun.workItemId,
            attempt: nodeRun.attempt,
            status: nodeRun.status,
        });
    }

    private isAgentNode(nodeId: string): boolean {
        return this.plan.isLimitedByConcurrency(nodeId);
    }
}

function peakRunningCount(entries: TimelineEntry[]): number {
    const runningNodeRunIds = new Set<string>();
    let maxRunning = 0;
    for (const entry of entries) {
        if (entry.status === "RUNNING") {
            runningNodeRunIds.add(entry.nodeRunId);
        }
        if (NODE_RUN_TERMINAL.has(entry.status)) {
            runningNodeRunIds.delete(entry.nodeRunId);
        }
        maxRunning = Math.max(maxRunning, runningNodeRunIds.size);
    }

    return maxRunning;
}

function chooseConditionPort(
    condition: Condition,
    inputs: Record<string, unknown>,
): Record<string, unknown> {
    const value = inputs[CONDITION_INPUT_PORT];
    const chosenPort = evaluateCondition(condition, value) ? "true" : "false";

    return { [chosenPort]: value };
}

function finishingEvent(nodeRunId: string, outcome: NodeOutcome, at: Date): SchedulerEvent {
    switch (outcome.kind) {
        case "succeed":
            return { type: "node_run_succeeded", nodeRunId, outputs: outcome.outputs, at };
        case "fail":
            return { type: "node_run_failed", nodeRunId, error: outcome.error, at };
        case "hit_usage_limit":
            return {
                type: "node_run_failed",
                nodeRunId,
                error: USAGE_LIMIT_REACHED,
                at,
                resetAt: outcome.resetAt,
            };
        default:
            return assertNever(outcome);
    }
}
