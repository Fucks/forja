import type { BudgetLimit, RunBudget } from "@/engine/budgets.js";
import { RUN_TERMINAL } from "@/engine/run_state.js";
import { createScheduler } from "@/engine/scheduler.js";
import type {
    SchedulerEvent,
    SchedulerOptions,
    SchedulerSnapshot,
} from "@/engine/scheduler_types.js";
import type { AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { Clock } from "@/lib/clock.js";
import type { IdPrefix } from "@/lib/ids.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import type { FlowService } from "@/server/flows/flow_service.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import type { RunRecord, RunRepository } from "@/server/runs/run_repository.js";
import { ActiveRun } from "@/server/runtime/active_run.js";
import { BUDGET_EXCEEDED_ACTION, loadDailyBudget } from "@/server/runtime/daily_budget.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { LogStore } from "@/server/runtime/log_store.js";
import { nodeExecutors, type NodeExecutorRegistry } from "@/server/runtime/node_executors.js";
import { runLifecycleEvent } from "@/server/runtime/run_events.js";
import {
    loadRunToolProfiles,
    type RunToolProfiles,
    type RunToolProfilesDeps,
} from "@/server/runtime/run_tool_profiles.js";
import {
    InvalidRunSnapshotError,
    isSchedulerSnapshotOfRun,
} from "@/server/runtime/stored_snapshot.js";
import type { SettingsService } from "@/server/settings/settings_service.js";
import type { UsageService } from "@/server/usage/usage_service.js";
import type { FlowVersion } from "@/shared/flow_types.js";
import type { Project } from "@/shared/project_types.js";
import type { GlobalSettings, ProjectSettings } from "@/shared/settings_types.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

// In production, WorkItemService.snapshots.
export interface ItemSource {
    getItems(projectId: string, ids: string[]): Promise<WorkItemSnapshot[]>;
}

export interface StartRunInput {
    projectId: string;
    flowId: string;
    // The latest published version when omitted.
    version?: number;
    itemIds: string[];
    triggerId?: string;
}

export interface Executor {
    startRun(input: StartRunInput): Promise<RunRecord>;
    cancelRun(runId: string): Promise<void>;
    pauseRun(runId: string): Promise<void>;
    resumeRun(runId: string): Promise<void>;
    cancelNodeRun(nodeRunId: string): Promise<void>;
    // A finished run is taken back from its snapshot, so the retry reopens it.
    retryNodeRun(nodeRunId: string): Promise<void>;
    // Keeps the daily budget of the project; resumes the run when the budget had paused it.
    raiseRunBudget(runId: string, runLimit: BudgetLimit | undefined): Promise<void>;
    // Takes over a run the previous server process left active.
    resumeFromSnapshot(run: RunRecord, snapshot: unknown): Promise<void>;
    activeRunIds(): string[];
}

export interface ExecutorDeps extends RunToolProfilesDeps {
    runs: RunRepository;
    flows: FlowService;
    projects: ProjectService;
    settings: SettingsService;
    items: ItemSource;
    runtime: AgentRuntime;
    events: EventBus;
    logs: LogStore;
    usage: UsageService;
    clock: Clock;
    newId(prefix: IdPrefix): string;
    // Defaults to the registry; tests stand in for the node types that are not implemented yet.
    nodeExecutors?: NodeExecutorRegistry;
}

// Everything a run needs, loaded before it is created.
interface RunSetup {
    version: FlowVersion;
    project: Project;
    projectSettings: ProjectSettings;
    globalSettings: GlobalSettings;
    toolProfiles: RunToolProfiles;
    items: WorkItemSnapshot[];
}

export function createExecutor(deps: ExecutorDeps): Executor {
    return new RunExecutor(deps);
}

class RunExecutor implements Executor {
    private readonly activeRuns = new Map<string, ActiveRun>();

    constructor(private readonly deps: ExecutorDeps) {}

    async startRun(input: StartRunInput): Promise<RunRecord> {
        const setup = await this.loadRunSetup(input);
        const record = await this.createQueuedRun(input, setup.version.version);
        const activeRun = await this.activate(record, setup);

        const items = setup.items.map(({ id }) => ({ id }));
        await activeRun.deliver({ type: "start", items, at: this.now() });

        return activeRun.current;
    }

    cancelRun(runId: string): Promise<void> {
        return this.deliverTo(runId, { type: "cancel_requested", at: this.now() });
    }

    pauseRun(runId: string): Promise<void> {
        return this.deliverTo(runId, { type: "pause_requested", at: this.now() });
    }

    resumeRun(runId: string): Promise<void> {
        return this.deliverTo(runId, { type: "resume_requested", at: this.now() });
    }

    async cancelNodeRun(nodeRunId: string): Promise<void> {
        const runId = await this.findRunIdOfNodeRun(nodeRunId);
        await this.deliverTo(runId, {
            type: "cancel_node_run_requested",
            nodeRunId,
            at: this.now(),
        });
    }

    async retryNodeRun(nodeRunId: string): Promise<void> {
        const runId = await this.findRunIdOfNodeRun(nodeRunId);
        await this.reactivateIfFinished(runId);
        await this.deliverTo(runId, {
            type: "retry_node_run_requested",
            nodeRunId,
            at: this.now(),
        });
    }

    async raiseRunBudget(runId: string, runLimit: BudgetLimit | undefined): Promise<void> {
        const activeRun = this.findActiveRun(runId);
        const settings = await this.deps.settings.getProjectSettings(activeRun.current.projectId);
        const budget: RunBudget = {
            onExceeded: BUDGET_EXCEEDED_ACTION,
            ...(await loadDailyBudget(this.deps.usage, settings, activeRun.current)),
            run: runLimit,
        };

        await activeRun.deliver({ type: "budget_raised", budget, at: this.now() });
    }

    async resumeFromSnapshot(run: RunRecord, snapshot: unknown): Promise<void> {
        if (!isSchedulerSnapshotOfRun(snapshot, run.id)) {
            throw new InvalidRunSnapshotError(run.id);
        }

        const activeRun = await this.restore(run, snapshot);
        await activeRun.resumeAfterRestart(snapshot);
    }

    activeRunIds(): string[] {
        return [...this.activeRuns.keys()];
    }

    private async reactivateIfFinished(runId: string): Promise<void> {
        if (this.activeRuns.has(runId)) {
            return;
        }

        const run = await this.deps.runs.getRun(runId);
        if (!run || !RUN_TERMINAL.has(run.status)) {
            return;
        }

        const snapshot = await this.deps.runs.getSnapshot(runId);
        if (!isSchedulerSnapshotOfRun(snapshot, runId)) {
            throw new InvalidRunSnapshotError(runId);
        }

        await this.restore(run, snapshot);
    }

    private async restore(run: RunRecord, snapshot: SchedulerSnapshot): Promise<ActiveRun> {
        const setup = await this.loadRunSetup({
            projectId: run.projectId,
            flowId: run.flowId,
            version: run.flowVersion,
            itemIds: run.itemIds,
        });

        return this.activate(run, setup, snapshot);
    }

    private async loadRunSetup(input: StartRunInput): Promise<RunSetup> {
        const { deps } = this;
        const [version, project, projectSettings, globalSettings, items] = await Promise.all([
            this.findPublishedVersion(input.flowId, input.version),
            deps.projects.get(input.projectId),
            deps.settings.getProjectSettings(input.projectId),
            deps.settings.getGlobalSettings(),
            deps.items.getItems(input.projectId, input.itemIds),
        ]);
        const toolProfiles = await loadRunToolProfiles(
            { graph: version.graph, project, settings: projectSettings },
            deps,
        );

        return { version, project, projectSettings, globalSettings, toolProfiles, items };
    }

    private async findPublishedVersion(flowId: string, version?: number): Promise<FlowVersion> {
        if (version !== undefined) {
            return this.deps.flows.getVersion(flowId, version);
        }

        const latest = (await this.deps.flows.listVersions(flowId)).at(-1);
        if (!latest) {
            throw new DomainValidationError("Publique o fluxo antes de executar.");
        }

        return this.deps.flows.getVersion(flowId, latest.version);
    }

    private async createQueuedRun(input: StartRunInput, flowVersion: number): Promise<RunRecord> {
        const record: RunRecord = {
            id: this.deps.newId("run"),
            projectId: input.projectId,
            flowId: input.flowId,
            flowVersion,
            status: "QUEUED",
            createdAt: this.now(),
            triggerId: input.triggerId,
            itemIds: input.itemIds,
            failedItemIds: [],
        };
        await this.deps.runs.createRun(record);
        this.deps.events.publish(runLifecycleEvent("run.created", record));

        return record;
    }

    private async activate(
        record: RunRecord,
        setup: RunSetup,
        restore?: SchedulerSnapshot,
    ): Promise<ActiveRun> {
        const { deps } = this;
        const { version, projectSettings, globalSettings } = setup;
        const dailyBudget = await loadDailyBudget(deps.usage, projectSettings, record);
        const activeRun = new ActiveRun({
            runs: deps.runs,
            events: deps.events,
            logs: deps.logs,
            usage: deps.usage,
            runtime: deps.runtime,
            clock: deps.clock,
            newId: (prefix) => deps.newId(prefix),
            record,
            graph: version.graph,
            project: setup.project,
            settings: projectSettings,
            toolProfiles: setup.toolProfiles,
            items: setup.items,
            scheduler: createScheduler(
                version.graph,
                record,
                this.schedulerOptionsOf(projectSettings, globalSettings, dailyBudget),
                restore,
            ),
            nodeExecutors: deps.nodeExecutors ?? nodeExecutors,
            onFinished: (runId) => this.activeRuns.delete(runId),
        });
        this.activeRuns.set(record.id, activeRun);

        return activeRun;
    }

    private schedulerOptionsOf(
        project: ProjectSettings,
        global: GlobalSettings,
        dailyBudget: RunBudget | undefined,
    ): SchedulerOptions {
        return {
            maxConcurrentAgents: Math.min(project.maxConcurrentAgents, global.maxConcurrentAgents),
            minStartIntervalMs: global.minStartIntervalMs,
            usageLimitMarginMinutes: global.usageLimitMarginMinutes,
            newId: () => this.deps.newId("nrn"),
            budget: dailyBudget,
        };
    }

    // Only runs of this server are active; a finished run is no longer in memory.
    private async deliverTo(runId: string, event: SchedulerEvent): Promise<void> {
        await this.findActiveRun(runId).deliver(event);
    }

    private findActiveRun(runId: string): ActiveRun {
        const activeRun = this.activeRuns.get(runId);
        if (!activeRun) {
            throw new NotFoundError(`A run ${runId} não está em andamento.`);
        }

        return activeRun;
    }

    private async findRunIdOfNodeRun(nodeRunId: string): Promise<string> {
        const nodeRun = await this.deps.runs.getNodeRun(nodeRunId);
        if (!nodeRun) {
            throw new NotFoundError(`A execução de nó ${nodeRunId} não existe.`);
        }

        return nodeRun.runId;
    }

    private now(): Date {
        return this.deps.clock.now();
    }
}
