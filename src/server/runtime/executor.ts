import type { RunBudget } from "@/engine/budgets.js";
import { createScheduler } from "@/engine/scheduler.js";
import type { SchedulerEvent, SchedulerOptions } from "@/engine/scheduler_types.js";
import type { AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { Clock } from "@/lib/clock.js";
import type { IdPrefix } from "@/lib/ids.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import type { FlowService } from "@/server/flows/flow_service.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import type { RunRecord, RunRepository } from "@/server/runs/run_repository.js";
import { ActiveRun } from "@/server/runtime/active_run.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { nodeExecutors, type NodeExecutorRegistry } from "@/server/runtime/node_executors.js";
import { runLifecycleEvent } from "@/server/runtime/run_events.js";
import type { SettingsService } from "@/server/settings/settings_service.js";
import type { FlowVersion } from "@/shared/flow_types.js";
import type { GlobalSettings, ProjectSettings } from "@/shared/settings_types.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

export type { WorkItemSnapshot } from "@/shared/work_item_types.js";

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
    retryNodeRun(nodeRunId: string): Promise<void>;
    activeRunIds(): string[];
}

export interface ExecutorDeps {
    runs: RunRepository;
    flows: FlowService;
    projects: ProjectService;
    settings: SettingsService;
    items: ItemSource;
    runtime: AgentRuntime;
    events: EventBus;
    clock: Clock;
    newId(prefix: IdPrefix): string;
    // Defaults to the registry; tests stand in for the node types that are not implemented yet.
    nodeExecutors?: NodeExecutorRegistry;
}

export function createExecutor(deps: ExecutorDeps): Executor {
    return new RunExecutor(deps);
}

class RunExecutor implements Executor {
    private readonly activeRuns = new Map<string, ActiveRun>();

    constructor(private readonly deps: ExecutorDeps) {}

    async startRun(input: StartRunInput): Promise<RunRecord> {
        const { deps } = this;
        const [version, project, projectSettings, globalSettings, items] = await Promise.all([
            this.findPublishedVersion(input.flowId, input.version),
            deps.projects.get(input.projectId),
            deps.settings.getProjectSettings(input.projectId),
            deps.settings.getGlobalSettings(),
            deps.items.getItems(input.projectId, input.itemIds),
        ]);
        const record = await this.createQueuedRun(input, version.version);

        const activeRun = new ActiveRun({
            ...deps,
            record,
            graph: version.graph,
            project,
            settings: projectSettings,
            items,
            scheduler: createScheduler(
                version.graph,
                record,
                this.schedulerOptionsOf(projectSettings, globalSettings),
            ),
            nodeExecutors: deps.nodeExecutors ?? nodeExecutors,
            onFinished: (runId) => this.activeRuns.delete(runId),
        });
        this.activeRuns.set(record.id, activeRun);
        await activeRun.deliver({
            type: "start",
            items: items.map(({ id }) => ({ id })),
            at: this.now(),
        });

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
        await this.deliverTo(runId, {
            type: "retry_node_run_requested",
            nodeRunId,
            at: this.now(),
        });
    }

    activeRunIds(): string[] {
        return [...this.activeRuns.keys()];
    }

    private async findPublishedVersion(flowId: string, version?: number): Promise<FlowVersion> {
        if (version !== undefined) {
            return this.deps.flows.getVersion(flowId, version);
        }

        const latest = (await this.deps.flows.listVersions(flowId)).at(-1);
        if (!latest) {
            throw new DomainValidationError("O fluxo ainda não tem uma versão publicada.");
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

    private schedulerOptionsOf(project: ProjectSettings, global: GlobalSettings): SchedulerOptions {
        return {
            maxConcurrentAgents: Math.min(project.maxConcurrentAgents, global.maxConcurrentAgents),
            minStartIntervalMs: global.minStartIntervalMs,
            usageLimitMarginMinutes: global.usageLimitMarginMinutes,
            newId: () => this.deps.newId("nrn"),
            budget: dailyBudgetOf(project),
        };
    }

    // Only runs of this server are active; a finished run is no longer in memory (#52 reloads them).
    private async deliverTo(runId: string, event: SchedulerEvent): Promise<void> {
        const activeRun = this.activeRuns.get(runId);
        if (!activeRun) {
            throw new NotFoundError(`A run ${runId} não está em andamento.`);
        }

        await activeRun.deliver(event);
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

// TODO(#59): report what the project already spent today.
function dailyBudgetOf(settings: ProjectSettings): RunBudget | undefined {
    if (settings.dailyBudgetUsd === null) {
        return undefined;
    }

    return {
        daily: { maxCostUsd: settings.dailyBudgetUsd, alreadySpentUsd: 0, alreadySpentTokens: 0 },
        onExceeded: "pause",
    };
}
