import type { NodeRunState } from "@/engine/node_run_state.js";
import type { AgentEvent, AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { Clock } from "@/lib/clock.js";
import type { ArtifactRecord, RunRecord } from "@/server/runs/run_repository.js";
import { executeAgentNode } from "@/server/runtime/executors/agent_executor.js";
import { executeConditionNode } from "@/server/runtime/executors/condition_executor.js";
import { executeOutputNode } from "@/server/runtime/executors/output_executor.js";
import { executeScriptNode } from "@/server/runtime/executors/script_executor.js";
import {
    createSourceExecutor,
    type SourceExecutorDeps,
} from "@/server/runtime/executors/source_executor.js";
import { executeTriggerNode } from "@/server/runtime/executors/trigger_executor.js";
import type { WorkspacePool } from "@/server/runtime/workspace_pool.js";
import type { FlowGraph, FlowNode, NodeType } from "@/shared/flow_graph.js";
import type { Project } from "@/shared/project_types.js";
import type { ProjectSettings } from "@/shared/settings_types.js";
import type { TokenUsage } from "@/shared/usage_types.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

export interface NodeExecutionContext {
    run: RunRecord;
    nodeRun: NodeRunState;
    node: FlowNode;
    graph: FlowGraph;
    inputs: Record<string, unknown>;
    item?: WorkItemSnapshot;
    runItems: WorkItemSnapshot[];
    project: Project;
    settings: ProjectSettings;
    workspaces: WorkspacePool;
    runtime: AgentRuntime;
    clock: Clock;
    signal: AbortSignal;
    onAgentEvent(event: AgentEvent): void;
}

export type NodeArtifact = Omit<ArtifactRecord, "id" | "nodeRunId" | "runId" | "createdAt">;

export interface ModelUsage {
    model: string;
    tokens: TokenUsage;
}

export interface NodeExecutionResult {
    outputs: Record<string, unknown>;
    artifacts?: NodeArtifact[];
    // Only agents spend tokens.
    usage?: ModelUsage;
}

export type NodeExecutor = (context: NodeExecutionContext) => Promise<NodeExecutionResult>;

export type NodeExecutorRegistry = Partial<Record<NodeType, NodeExecutor>>;

// The executors that need nothing beyond the context. The git and gate nodes get theirs in #79
// and #81.
export const nodeExecutors: NodeExecutorRegistry = {
    trigger: executeTriggerNode,
    agent: executeAgentNode,
    script: executeScriptNode,
    condition: executeConditionNode,
    output: executeOutputNode,
};

export function createNodeExecutors(deps: SourceExecutorDeps): NodeExecutorRegistry {
    return { ...nodeExecutors, source: createSourceExecutor(deps) };
}
