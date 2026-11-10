import type { AgentRunRequest } from "@/integrations/agent_runtime/agent_runtime.js";

export function buildAgentRunRequest(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
    return {
        nodeRunId: "nrn_01J9ZK3M4N5P6Q7R8S9TAGENT1",
        prompt: "Implemente a issue #7",
        model: "claude-sonnet-5-5",
        effort: "medium",
        maxIterations: 1,
        idleTimeoutSeconds: 600,
        timeoutMs: 3_600_000,
        permissionMode: "acceptEdits",
        toolArgs: [],
        runtimeFiles: [],
        expandPromptCommands: false,
        env: {},
        signal: new AbortController().signal,
        ...overrides,
    };
}
