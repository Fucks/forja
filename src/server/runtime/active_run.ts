import { isItemInProgress } from "@/engine/map_group.js";
import { NODE_RUN_TERMINAL, type NodeRunState } from "@/engine/node_run_state.js";
import { RUN_TERMINAL, type RunState } from "@/engine/run_state.js";
import { runningNodeRunIdsOf, wakeupTimesOf } from "@/engine/scheduler_snapshot.js";
import type {
    Scheduler,
    SchedulerCommand,
    SchedulerEvent,
    SchedulerSnapshot,
} from "@/engine/scheduler_types.js";
import type { AgentEvent, AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import { assertNever } from "@/lib/assert_never.js";
import type { CancelTimeout, Clock } from "@/lib/clock.js";
import type { IdPrefix } from "@/lib/ids.js";
import type { RunRecord, RunRepository } from "@/server/runs/run_repository.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { createLogAnnouncer, type LogAnnouncer } from "@/server/runtime/log_announcer.js";
import type { LogStore } from "@/server/runtime/log_store.js";
import { NodeRunExecution } from "@/server/runtime/node_run_execution.js";
import type { NodeExecutorRegistry } from "@/server/runtime/node_executors.js";
import { limitRecordedInputs } from "@/server/runtime/recorded_inputs.js";
import { buildWorkspaceSpec } from "@/server/runtime/run_context.js";
import {
    groupProgressEvent,
    logAppendedEvent,
    nodeRunUpdatedEvent,
    runChangedEvent,
    usageLimitReachedEvent,
    usageLimitResetEvent,
} from "@/server/runtime/run_events.js";
import { createWorkspacePool, type WorkspacePool } from "@/server/runtime/workspace_pool.js";
import type { UsageService } from "@/server/usage/usage_service.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { Project } from "@/shared/project_types.js";
import type { ProjectSettings } from "@/shared/settings_types.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

type StartNodeRunCommand = Extract<SchedulerCommand, { type: "start_node_run" }>;

export interface ActiveRunDeps {
    record: RunRecord;
    graph: FlowGraph;
    project: Project;
    settings: ProjectSettings;
    items: WorkItemSnapshot[];
    scheduler: Scheduler;
    runs: RunRepository;
    events: EventBus;
    logs: LogStore;
    usage: UsageService;
    runtime: AgentRuntime;
    clock: Clock;
    nodeExecutors: NodeExecutorRegistry;
    newId(prefix: IdPrefix): string;
    onFinished(runId: string): void;
}

// Feeds the scheduler and carries out its commands; events are handled one at a time so that
// two NodeRuns finishing together never interleave inside the scheduler.
export class ActiveRun {
    private record: RunRecord;
    private queue: Promise<void> = Promise.resolve();
    private readonly workspaces: WorkspacePool;
    private readonly runningExecutions = new Map<string, NodeRunExecution>();
    private readonly pendingWakeups = new Set<CancelTimeout>();
    private readonly logAnnouncer: LogAnnouncer;

    constructor(private readonly deps: ActiveRunDeps) {
        this.record = deps.record;
        this.workspaces = createWorkspacePool({
            runtime: deps.runtime,
            specOf: (item) =>
                buildWorkspaceSpec(
                    { run: this.record, project: deps.project, settings: deps.settings },
                    item,
                ),
        });
        this.logAnnouncer = createLogAnnouncer({
            clock: deps.clock,
            publish: (nodeRunId, range) =>
                deps.events.publish(logAppendedEvent(this.record, nodeRunId, range)),
        });
    }

    get current(): RunRecord {
        return this.record;
    }

    deliver(event: SchedulerEvent): Promise<void> {
        return this.enqueue(() => this.deps.scheduler.handle(event));
    }

    // The NodeRuns that were running and the timers that were set died with the previous process.
    async resumeAfterRestart(snapshot: SchedulerSnapshot): Promise<void> {
        const at = this.deps.clock.now();
        const interruptions = runningNodeRunIdsOf(snapshot).map((nodeRunId) =>
            this.deliver({ type: "node_run_interrupted", nodeRunId, at }),
        );
        await Promise.all(interruptions);

        wakeupTimesOf(snapshot).forEach((wakeupAt) => this.scheduleWakeup(wakeupAt));
        await this.tick();
    }

    private tick(): Promise<void> {
        return this.enqueue(() => this.deps.scheduler.tick(this.deps.clock.now()));
    }

    private enqueue(takeCommands: () => SchedulerCommand[]): Promise<void> {
        const processing = this.queue.then(() => this.executeCommands(takeCommands()));
        // The caller gets the failure; the next events must still be handled.
        this.queue = processing.catch(() => undefined);

        return processing;
    }

    private async executeCommands(commands: SchedulerCommand[]): Promise<void> {
        for (const command of commands) {
            await this.executeCommand(command);
        }

        await this.releaseWorkspacesOfFinishedItems();
        if (RUN_TERMINAL.has(this.record.status)) {
            await this.finish();
        }
    }

    private async executeCommand(command: SchedulerCommand): Promise<void> {
        switch (command.type) {
            case "start_node_run":
                this.startNodeRun(command);
                break;
            case "cancel_node_run":
                this.runningExecutions.get(command.nodeRunId)?.cancel();
                break;
            case "node_run_changed":
                await this.saveNodeRun(command.nodeRun);
                break;
            case "run_changed":
                await this.saveRun(command.run);
                break;
            case "group_progress":
                this.deps.events.publish(groupProgressEvent(this.record, command));
                break;
            case "schedule_wakeup":
                this.scheduleWakeup(command.at);
                break;
            case "usage_limit_reached":
                this.deps.events.publish(usageLimitReachedEvent(this.record, command.resetAt));
                break;
            case "usage_limit_reset":
                this.deps.events.publish(usageLimitResetEvent(this.record));
                break;
            default:
                assertNever(command);
        }
    }

    private startNodeRun({ nodeRun, inputs }: StartNodeRunCommand): void {
        const { deps } = this;
        const execution = new NodeRunExecution({
            run: this.record,
            nodeRun,
            inputs,
            item: deps.items.find((item) => item.id === nodeRun.workItemId),
            graph: deps.graph,
            project: deps.project,
            settings: deps.settings,
            workspaces: this.workspaces,
            runtime: deps.runtime,
            clock: deps.clock,
            runs: deps.runs,
            events: deps.events,
            usage: deps.usage,
            nodeExecutors: deps.nodeExecutors,
            newId: (prefix) => deps.newId(prefix),
            recordAgentEvent: (event) => this.recordAgentEvent(nodeRun.id, event),
            deliver: (event) => this.deliver(event),
        });
        this.runningExecutions.set(nodeRun.id, execution);
        this.inBackground(
            execution.execute().finally(() => this.runningExecutions.delete(nodeRun.id)),
        );
    }

    private recordAgentEvent(nodeRunId: string, event: AgentEvent): void {
        this.inBackground(this.appendToLog(nodeRunId, event));
    }

    private async appendToLog(nodeRunId: string, event: AgentEvent): Promise<void> {
        const stored = await this.deps.logs.append({ runId: this.record.id, nodeRunId }, event);
        this.logAnnouncer.announce(nodeRunId, stored.seq);
    }

    private async saveNodeRun(nodeRun: NodeRunState): Promise<void> {
        await this.deps.runs.saveTransition({
            nodeRuns: [limitRecordedInputs(nodeRun)],
            snapshot: this.deps.scheduler.snapshot(),
        });
        this.deps.events.publish(nodeRunUpdatedEvent(this.record, nodeRun));
    }

    private async saveRun(run: RunState): Promise<void> {
        const previous = this.record;
        this.record = { ...this.record, ...run };
        await this.deps.runs.saveTransition({ run, snapshot: this.deps.scheduler.snapshot() });

        const event = runChangedEvent(previous, run);
        if (event) {
            this.deps.events.publish(event);
        }
    }

    private scheduleWakeup(at: Date): void {
        const { clock } = this.deps;
        const cancelWakeup = clock.setTimeout(() => {
            this.pendingWakeups.delete(cancelWakeup);
            this.inBackground(this.tick());
        }, at.getTime() - clock.now().getTime());
        this.pendingWakeups.add(cancelWakeup);
    }

    // The workspace closes as soon as the item has nothing left to run in the whole run.
    private async releaseWorkspacesOfFinishedItems(): Promise<void> {
        const itemIdsWithWorkspace = this.deps.items
            .map((item) => item.id)
            .filter((itemId) => this.workspaces.hasWorkspace(itemId));
        if (itemIdsWithWorkspace.length === 0) {
            return;
        }

        const snapshot = this.deps.scheduler.snapshot();
        const finishedItemIds = itemIdsWithWorkspace.filter((itemId) =>
            hasItemFinished(snapshot, itemId),
        );
        await Promise.all(finishedItemIds.map((itemId) => this.workspaces.release(itemId)));
    }

    // Nobody awaits the NodeRun executions and the wakeups, so their failures are reported here.
    private inBackground(work: Promise<void>): void {
        work.catch((error: unknown) => {
            console.error(`Falha ao processar a run ${this.record.id}`, error);
        });
    }

    private async finish(): Promise<void> {
        this.pendingWakeups.forEach((cancelWakeup) => cancelWakeup());
        this.pendingWakeups.clear();
        await this.workspaces.releaseAll();
        this.deps.onFinished(this.record.id);
    }
}

// An item queued for the next map has no NodeRun yet, so the maps are asked too.
function hasItemFinished(snapshot: SchedulerSnapshot, itemId: string): boolean {
    const hasNodeRunAhead = snapshot.nodeRuns.some(
        (nodeRun) => nodeRun.workItemId === itemId && !NODE_RUN_TERMINAL.has(nodeRun.status),
    );
    const isInAnyMap = (snapshot.mapGroups ?? []).some((mapGroup) =>
        isItemInProgress(mapGroup, itemId),
    );

    return !hasNodeRunAhead && !isInAnyMap;
}
