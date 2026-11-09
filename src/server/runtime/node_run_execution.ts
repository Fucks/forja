import { budgetTokensOf } from "@/engine/budgets.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { SchedulerEvent } from "@/engine/scheduler_types.js";
import type { AgentEvent, AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { Clock } from "@/lib/clock.js";
import type { IdPrefix } from "@/lib/ids.js";
import { NotFoundError } from "@/server/errors.js";
import type { ArtifactRecord, RunRecord, RunRepository } from "@/server/runs/run_repository.js";
import { mapAgentError, usageLimitResetAtOf } from "@/server/runtime/error_mapping.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type {
    ModelUsage,
    NodeArtifact,
    NodeExecutionContext,
    NodeExecutionResult,
    NodeExecutor,
    NodeExecutorRegistry,
} from "@/server/runtime/node_executors.js";
import { usageRecordedEvent } from "@/server/runtime/run_events.js";
import { UnsupportedNodeTypeError } from "@/server/runtime/unsupported_node_type_error.js";
import type { WorkspacePool } from "@/server/runtime/workspace_pool.js";
import type { NewUsageRecord, UsageService } from "@/server/usage/usage_service.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import type { Project } from "@/shared/project_types.js";
import type { ProjectSettings } from "@/shared/settings_types.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

type ExecutionOutcome = { ok: true; result: NodeExecutionResult } | { ok: false; error: unknown };

export interface NodeRunExecutionDeps {
    run: RunRecord;
    nodeRun: NodeRunState;
    inputs: Record<string, unknown>;
    item?: WorkItemSnapshot;
    graph: FlowGraph;
    project: Project;
    settings: ProjectSettings;
    workspaces: WorkspacePool;
    runtime: AgentRuntime;
    clock: Clock;
    runs: RunRepository;
    events: EventBus;
    usage: UsageService;
    nodeExecutors: NodeExecutorRegistry;
    newId(prefix: IdPrefix): string;
    recordAgentEvent(event: AgentEvent): void;
    deliver(event: SchedulerEvent): Promise<void>;
}

// Runs the executor of one NodeRun and reports how it ended back to the scheduler.
export class NodeRunExecution {
    private readonly abortController = new AbortController();

    constructor(private readonly deps: NodeRunExecutionDeps) {}

    cancel(): void {
        this.abortController.abort();
    }

    async execute(): Promise<void> {
        const outcome = await this.runExecutor();
        if (!outcome.ok) {
            await this.deps.deliver(this.failureEventOf(outcome.error));
            return;
        }

        await this.complete(outcome.result);
    }

    private async runExecutor(): Promise<ExecutionOutcome> {
        try {
            const node = this.findNode();
            const result = await this.executorOf(node)(this.contextFor(node));
            return { ok: true, result };
        } catch (error) {
            return { ok: false, error };
        }
    }

    private findNode(): FlowNode {
        const { graph, nodeRun } = this.deps;
        const node = graph.nodes.find((candidate) => candidate.id === nodeRun.nodeId);
        if (!node) {
            throw new NotFoundError(`O nó ${nodeRun.nodeId} não existe na versão do fluxo`);
        }

        return node;
    }

    private executorOf(node: FlowNode): NodeExecutor {
        const executor = this.deps.nodeExecutors[node.type];
        if (!executor) {
            throw new UnsupportedNodeTypeError(node.type);
        }

        return executor;
    }

    private contextFor(node: FlowNode): NodeExecutionContext {
        const { deps } = this;

        return {
            run: deps.run,
            nodeRun: deps.nodeRun,
            node,
            graph: deps.graph,
            inputs: deps.inputs,
            item: deps.item,
            project: deps.project,
            settings: deps.settings,
            workspaces: deps.workspaces,
            runtime: deps.runtime,
            clock: deps.clock,
            signal: this.abortController.signal,
            onAgentEvent: (event) => deps.recordAgentEvent(event),
        };
    }

    private failureEventOf(error: unknown): SchedulerEvent {
        return {
            type: "node_run_failed",
            nodeRunId: this.deps.nodeRun.id,
            error: mapAgentError(error),
            resetAt: usageLimitResetAtOf(error),
            at: this.deps.clock.now(),
        };
    }

    private async complete(result: NodeExecutionResult): Promise<void> {
        await this.saveArtifacts(result.artifacts ?? []);
        if (result.usage) {
            await this.recordUsage(result.usage);
        }

        await this.deps.deliver({
            type: "node_run_succeeded",
            nodeRunId: this.deps.nodeRun.id,
            outputs: result.outputs,
            at: this.deps.clock.now(),
        });
    }

    private async saveArtifacts(artifacts: NodeArtifact[]): Promise<void> {
        if (artifacts.length === 0) {
            return;
        }

        await this.deps.runs.saveTransition({
            artifacts: artifacts.map((artifact) => this.recordOf(artifact)),
        });
    }

    private recordOf(artifact: NodeArtifact): ArtifactRecord {
        const { run, nodeRun, clock } = this.deps;

        return {
            ...artifact,
            id: this.deps.newId("art"),
            nodeRunId: nodeRun.id,
            runId: run.id,
            createdAt: clock.now().toISOString(),
        };
    }

    private async recordUsage(modelUsage: ModelUsage): Promise<void> {
        const { run, nodeRun, events, clock } = this.deps;
        const record = await this.deps.usage.record(this.usageRecordOf(modelUsage));
        const { usage, costUsd } = record;
        events.publish(usageRecordedEvent(run, nodeRun.id, { ...usage, costUsd }));

        await this.deps.deliver({
            type: "usage_recorded",
            nodeRunId: nodeRun.id,
            costUsd,
            tokens: budgetTokensOf(usage),
            at: clock.now(),
        });
    }

    private usageRecordOf({ model, tokens }: ModelUsage): NewUsageRecord {
        const { run, nodeRun } = this.deps;

        return {
            projectId: run.projectId,
            runId: run.id,
            flowId: run.flowId,
            nodeId: nodeRun.nodeId,
            nodeRunId: nodeRun.id,
            workItemId: nodeRun.workItemId,
            iteration: nodeRun.iteration,
            model,
            usage: tokens,
        };
    }
}
