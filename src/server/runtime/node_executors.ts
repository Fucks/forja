import type { NodeRunState } from "@/engine/node_run_state.js";
import type { AgentEvent, AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { Clock } from "@/lib/clock.js";
import type { ArtifactRecord, RunRecord } from "@/server/runs/run_repository.js";
import { executeAgentNode } from "@/server/runtime/executors/agent_executor.js";
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

// Each node type gets its executor in its own issue: #54 → #70 → #79 → #81.
export const nodeExecutors: NodeExecutorRegistry = {
    agent: executeAgentNode,
};
