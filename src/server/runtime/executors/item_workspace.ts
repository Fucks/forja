import { AgentRuntimeError } from "@/integrations/agent_runtime/agent_errors.js";
import type { AgentRunHooks, Workspace } from "@/integrations/agent_runtime/agent_runtime.js";
import type { NodeExecutionContext } from "@/server/runtime/node_executors.js";

export async function acquireItemWorkspace(
    context: NodeExecutionContext,
    hooks: AgentRunHooks,
): Promise<Workspace> {
    if (!context.item) {
        throw new AgentRuntimeError('Um nó com workspace "item" precisa de um item de trabalho');
    }

    return context.workspaces.acquire(context.item, { hooks, signal: context.signal });
}
