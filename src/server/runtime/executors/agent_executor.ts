import { type AgentNode, renderPrompt } from "@/engine/prompt_template.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
} from "@/integrations/agent_runtime/agent_runtime.js";
import { assertNever } from "@/lib/assert_never.js";
import { acquireItemWorkspace } from "@/server/runtime/executors/item_workspace.js";
import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import type { NodeExecutionContext, NodeExecutionResult } from "@/server/runtime/node_executors.js";
import { buildHeadlessSpec, buildPromptContext } from "@/server/runtime/run_context.js";
import { resolveAgentDefaults } from "@/server/settings/resolve_agent_defaults.js";
import type { PermissionMode } from "@/shared/agent_types.js";

const SECONDS_PER_MINUTE = 60;
const MS_PER_MINUTE = 60_000;
const PROJECT_CONVENTIONS_HEADING = "## Convenções do projeto";
// TODO(#61): take the permission mode from the tool profile of the node.
const PERMISSION_MODE: PermissionMode = "bypassPermissions";
// TODO(#61): take the tool and MCP flags from the tool profile of the node.
const TOOL_ARGS: string[] = [];

export async function executeAgentNode(
    context: NodeExecutionContext,
): Promise<NodeExecutionResult> {
    const node = asNodeOfType(context.node, "agent");
    const request = buildAgentRunRequest(context, node);
    const result = await runAgent(context, node, request);

    return {
        outputs: { result: result.output, summary: result.summary },
        usage: { model: request.model, tokens: result.usage },
    };
}

function buildAgentRunRequest(context: NodeExecutionContext, node: AgentNode): AgentRunRequest {
    const { config } = node;
    const defaults = resolveAgentDefaults(context.settings, config);

    return {
        nodeRunId: context.nodeRun.id,
        prompt: appendProjectConventions(renderNodePrompt(context, node), defaults.systemPrompt),
        model: defaults.model,
        effort: defaults.effort,
        maxIterations: config.maxIterations,
        maxTurns: config.maxTurns,
        maxBudgetUsd: config.maxBudgetUsd,
        idleTimeoutSeconds: config.idleTimeoutMinutes * SECONDS_PER_MINUTE,
        timeoutMs: config.timeoutMinutes * MS_PER_MINUTE,
        permissionMode: PERMISSION_MODE,
        outputSchema: config.outputSchema,
        completionSignal: config.completionSignal,
        toolArgs: TOOL_ARGS,
        expandPromptCommands: config.expandPromptCommands,
        env: {},
        signal: context.signal,
    };
}

function renderNodePrompt(context: NodeExecutionContext, node: AgentNode): string {
    return renderPrompt(node.config.prompt, buildPromptContext(context));
}

function appendProjectConventions(prompt: string, systemPrompt: string): string {
    if (systemPrompt.trim() === "") {
        return prompt;
    }

    return `${prompt}\n\n${PROJECT_CONVENTIONS_HEADING}\n\n${systemPrompt}`;
}

function runAgent(
    context: NodeExecutionContext,
    node: AgentNode,
    request: AgentRunRequest,
): Promise<AgentRunResult> {
    const hooks: AgentRunHooks = { onEvent: (event) => context.onAgentEvent(event) };
    const { workspace } = node.config;
    switch (workspace) {
        case "item":
            return runAgentInItemWorkspace(context, request, hooks);
        case "none":
            return context.runtime.runHeadless(
                buildHeadlessSpec(context, context.item),
                request,
                hooks,
            );
        default:
            return assertNever(workspace);
    }
}

async function runAgentInItemWorkspace(
    context: NodeExecutionContext,
    request: AgentRunRequest,
    hooks: AgentRunHooks,
): Promise<AgentRunResult> {
    const workspace = await acquireItemWorkspace(context, hooks);

    return workspace.runAgent(request, hooks);
}
