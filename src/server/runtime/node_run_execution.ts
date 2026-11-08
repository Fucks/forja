import type { NodeRunState } from "@/engine/node_run_state.js";
import type { SchedulerEvent } from "@/engine/scheduler_types.js";
import type { AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { Clock } from "@/lib/clock.js";
import type { IdPrefix } from "@/lib/ids.js";
import { NotFoundError } from "@/server/errors.js";
import type { ArtifactRecord, RunRecord, RunRepository } from "@/server/runs/run_repository.js";
import { mapAgentError, usageLimitResetAtOf } from "@/server/runtime/error_mapping.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type {
    NodeArtifact,
    NodeExecutionContext,
    NodeExecutionResult,
    NodeExecutor,
    NodeExecutorRegistry,
} from "@/server/runtime/node_executors.js";
import { UnsupportedNodeTypeError } from "@/server/runtime/unsupported_node_type_error.js";
import type { WorkspacePool } from "@/server/runtime/workspace_pool.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import type { Project } from "@/shared/project_types.js";
import type { ProjectSettings } from "@/shared/settings_types.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

type NodeUsage = NonNullable<NodeExecutionResult["usage"]>;

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
    nodeExecutors: NodeExecutorRegistry;
    newId(prefix: IdPrefix): string;
    announceAgentEvent(): void;
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
            onAgentEvent: () => deps.announceAgentEvent(),
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

    // TODO(#59): persist the usage and estimate its cost from the model prices.
    private async recordUsage(usage: NodeUsage): Promise<void> {
        const { run, nodeRun, events, clock } = this.deps;
        const costUsd = usage.costUsd ?? 0;
        events.publish({
            type: "usage.recorded",
            runId: run.id,
            projectId: run.projectId,
            nodeRunId: nodeRun.id,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costUsd,
        });

        const tokens = usage.inputTokens + usage.outputTokens;
        await this.deps.deliver({
            type: "usage_recorded",
            nodeRunId: nodeRun.id,
            costUsd,
            tokens,
            at: clock.now(),
        });
    }
}
