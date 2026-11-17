import type { NodeRunState } from "@/engine/node_run_state.js";
import type { AgentEvent, AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { Clock } from "@/lib/clock.js";
import type { ArtifactRecord, RunRecord } from "@/server/runs/run_repository.js";
import { executeAgentNode } from "@/server/runtime/executors/agent_executor.js";
import { executeConditionNode } from "@/server/runtime/executors/condition_executor.js";
import {
    createGitExecutor,
    type GitExecutorDeps,
} from "@/server/runtime/executors/git_executor.js";
import {
    createOutputExecutor,
    type OutputExecutorDeps,
} from "@/server/runtime/executors/output_executor.js";
import { executeScriptNode } from "@/server/runtime/executors/script_executor.js";
import {
    createSourceExecutor,
    type SourceExecutorDeps,
} from "@/server/runtime/executors/source_executor.js";
import { executeTriggerNode } from "@/server/runtime/executors/trigger_executor.js";
import type { RunCredentials } from "@/server/runtime/run_credentials.js";
import type { RunToolProfiles } from "@/server/runtime/run_tool_profiles.js";
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
    // The outputs of the nodes before this one, by node slug: what `nodes.*` paths read.
    upstreamOutputs: Record<string, Record<string, unknown>>;
    item?: WorkItemSnapshot;
    runItems: WorkItemSnapshot[];
    project: Project;
    settings: ProjectSettings;
    toolProfiles: RunToolProfiles;
    credentials: RunCredentials;
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

// A gate does not finish by itself: the scheduler finishes it when its approval is resolved.
export interface WaitingForApproval {
    waiting: "approval";
    approvalId: string;
    expiresAt?: Date;
}

export type NodeExecutionOutcome = NodeExecutionResult | WaitingForApproval;

export type NodeExecutor<Outcome extends NodeExecutionOutcome = NodeExecutionResult> = (
    context: NodeExecutionContext,
) => Promise<Outcome>;

export type NodeExecutorRegistry = Partial<Record<NodeType, NodeExecutor<NodeExecutionOutcome>>>;

export function isWaitingForApproval(outcome: NodeExecutionOutcome): outcome is WaitingForApproval {
    return "waiting" in outcome;
}

// The executors that need nothing beyond the context; the executor adds the gate's, which needs
// the approvals, and `createNodeExecutors` the ones that need repositories or providers.
export const nodeExecutors: NodeExecutorRegistry = {
    trigger: executeTriggerNode,
    agent: executeAgentNode,
    script: executeScriptNode,
    condition: executeConditionNode,
};

export type NodeExecutorDeps = SourceExecutorDeps & GitExecutorDeps & OutputExecutorDeps;

export function createNodeExecutors(deps: NodeExecutorDeps): NodeExecutorRegistry {
    return {
        ...nodeExecutors,
        source: createSourceExecutor(deps),
        git: createGitExecutor(deps),
        output: createOutputExecutor(deps),
    };
}
