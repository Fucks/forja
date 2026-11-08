import { AgentRuntimeError } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
} from "@/integrations/agent_runtime/agent_runtime.js";
import type { ContainerManager } from "@/integrations/agent_runtime/container_manager.js";

/** The container an agent runs in; `env` is the workspace environment (credentials included). */
export interface AgentContainer {
    containerId: string;
    containers: ContainerManager;
    env: Record<string, string>;
}

export type RunAgentInContainer = (
    container: AgentContainer,
    request: AgentRunRequest,
    hooks: AgentRunHooks,
) => Promise<AgentRunResult>;

// TODO(#57): replace with the Claude Code adapter.
export const runAgentNotImplemented: RunAgentInContainer = () =>
    Promise.reject(new AgentRuntimeError("A execução do agente no container ainda não existe"));
