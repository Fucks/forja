import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
} from "@/integrations/agent_runtime/agent_runtime.js";
import type { ContainerManager } from "@/integrations/agent_runtime/container_manager.js";
import type { WorkspaceCommits } from "@/integrations/agent_runtime/workspace_commits.js";

/** The container an agent runs in; `env` is the workspace environment (credentials included). */
export interface AgentContainer {
    containerId: string;
    containers: ContainerManager;
    env: Record<string, string>;
    /** Absent for headless runs, which have no worktree. */
    commits?: WorkspaceCommits;
}

export type RunAgentInContainer = (
    container: AgentContainer,
    request: AgentRunRequest,
    hooks: AgentRunHooks,
) => Promise<AgentRunResult>;
