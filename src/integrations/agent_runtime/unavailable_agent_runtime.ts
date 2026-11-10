import { WorkspaceError } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentRunResult,
    AgentRuntime,
    OpenWorkspaceSummary,
    RuntimeDir,
    Workspace,
} from "@/integrations/agent_runtime/agent_runtime.js";

const NOT_CONFIGURED_MESSAGE = "Runtime de agentes ainda não configurado";

// Stands in until the Docker runtime (#58) and the demo mode (#71) are wired in main.ts.
export class UnavailableAgentRuntime implements AgentRuntime {
    openWorkspace(): Promise<Workspace> {
        return rejectAsNotConfigured();
    }

    headlessRuntimeDir(): RuntimeDir {
        throw new WorkspaceError(NOT_CONFIGURED_MESSAGE);
    }

    runHeadless(): Promise<AgentRunResult> {
        return rejectAsNotConfigured();
    }

    listOpenWorkspaces(): Promise<OpenWorkspaceSummary[]> {
        return Promise.resolve([]);
    }

    closeWorkspace(): Promise<void> {
        return Promise.resolve();
    }
}

function rejectAsNotConfigured(): Promise<never> {
    return Promise.reject(new WorkspaceError(NOT_CONFIGURED_MESSAGE));
}
