import { type AgentNode, renderPrompt } from "@/engine/prompt_template.js";
import { buildAgentEnv, type ClaudeCredential } from "@/integrations/agent_runtime/agent_env.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
    RuntimeDir,
} from "@/integrations/agent_runtime/agent_runtime.js";
import {
    materializeToolProfile,
    type ToolProfileMaterialization,
} from "@/integrations/agent_runtime/tool_profile_materializer.js";
import { assertNever } from "@/lib/assert_never.js";
import { acquireItemWorkspace } from "@/server/runtime/executors/item_workspace.js";
import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import type { NodeExecutionContext, NodeExecutionResult } from "@/server/runtime/node_executors.js";
import { buildDataContext, buildHeadlessSpec } from "@/server/runtime/run_context.js";
import { resolveAgentDefaults } from "@/server/settings/resolve_agent_defaults.js";

const SECONDS_PER_MINUTE = 60;
const MS_PER_MINUTE = 60_000;
const PROJECT_CONVENTIONS_HEADING = "## Convenções do projeto";

// Where the agent runs, known before the request is built: the MCP file goes in its runtime dir.
interface AgentRunTarget {
    runtimeDir: RuntimeDir;
    run(request: AgentRunRequest): Promise<AgentRunResult>;
}

interface AgentRunSetup {
    runtimeDir: RuntimeDir;
    claude: ClaudeCredential;
}

export async function executeAgentNode(
    context: NodeExecutionContext,
): Promise<NodeExecutionResult> {
    const node = asNodeOfType(context.node, "agent");
    // Before the target, so a node without a credential fails without opening a workspace.
    const claude = context.credentials.claudeCredentialOf(node);
    const target = await prepareRunTarget(context, node);
    const request = buildAgentRunRequest(context, node, { runtimeDir: target.runtimeDir, claude });
    const result = await target.run(request);

    return {
        outputs: { result: resultOfAgent(node, result), summary: result.summary },
        usage: { model: request.model, tokens: result.usage },
    };
}

function prepareRunTarget(context: NodeExecutionContext, node: AgentNode): Promise<AgentRunTarget> {
    const hooks: AgentRunHooks = { onEvent: (event) => context.onAgentEvent(event) };
    const { workspace } = node.config;
    switch (workspace) {
        case "item":
            return itemWorkspaceTarget(context, hooks);
        case "none":
            return Promise.resolve(headlessTarget(context, hooks));
        default:
            return assertNever(workspace);
    }
}

async function itemWorkspaceTarget(
    context: NodeExecutionContext,
    hooks: AgentRunHooks,
): Promise<AgentRunTarget> {
    const workspace = await acquireItemWorkspace(context, hooks);

    return {
        runtimeDir: workspace.runtimeDir,
        run: (request) => workspace.runAgent(request, hooks),
    };
}

function headlessTarget(context: NodeExecutionContext, hooks: AgentRunHooks): AgentRunTarget {
    const { runtime } = context;

    return {
        runtimeDir: runtime.headlessRuntimeDir(context.run.id, context.nodeRun.id),
        run: (request) =>
            runtime.runHeadless(buildHeadlessSpec(context, context.item), request, hooks),
    };
}

function buildAgentRunRequest(
    context: NodeExecutionContext,
    node: AgentNode,
    { runtimeDir, claude }: AgentRunSetup,
): AgentRunRequest {
    const { config } = node;
    const defaults = resolveAgentDefaults(context.settings, config);
    const toolProfile = materializeNodeToolProfile(context, node, runtimeDir);

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
        permissionMode: toolProfile.permissionMode,
        outputSchema: config.outputSchema,
        completionSignal: config.completionSignal,
        toolArgs: toolProfile.toolArgs,
        runtimeFiles: [toolProfile.mcpConfigFile],
        expandPromptCommands: config.expandPromptCommands,
        env: buildAgentEnv({
            claude,
            github: context.credentials.githubToken,
            extra: toolProfile.env,
        }),
        signal: context.signal,
    };
}

function materializeNodeToolProfile(
    context: NodeExecutionContext,
    node: AgentNode,
    runtimeDir: RuntimeDir,
): ToolProfileMaterialization {
    const { toolProfiles } = context;

    return materializeToolProfile(toolProfiles.profileOf(node), {
        nodeId: node.id,
        runtimeDir,
        credentialEnv: (id) => toolProfiles.credentialEnv(id),
        hasPackageJson: toolProfiles.hasPackageJson,
    });
}

function renderNodePrompt(context: NodeExecutionContext, node: AgentNode): string {
    return renderPrompt(node.config.prompt, buildDataContext(context));
}

function appendProjectConventions(prompt: string, systemPrompt: string): string {
    if (systemPrompt.trim() === "") {
        return prompt;
    }

    return `${prompt}\n\n${PROJECT_CONVENTIONS_HEADING}\n\n${systemPrompt}`;
}

// Without a schema the agent answers in free text, so its result is what it left on the branch.
function resultOfAgent(node: AgentNode, result: AgentRunResult): unknown {
    if (node.config.outputSchema) {
        return result.output;
    }

    return { commits: result.commits.length };
}
