import type {
    AgentEvent,
    AgentRunHooks,
    ExecResult,
} from "@/integrations/agent_runtime/agent_runtime.js";
import { acquireItemWorkspace } from "@/server/runtime/executors/item_workspace.js";
import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import type { NodeExecutionContext, NodeExecutionResult } from "@/server/runtime/node_executors.js";

const MS_PER_MINUTE = 60_000;
const STDOUT_TAIL_MAX_LINES = 200;
const LINE_SEPARATOR = "\n";

// A failing exit code is a result for the loop condition to judge, not a failure of the node:
// only a timeout or a workspace error fails it.
export async function executeScriptNode(
    context: NodeExecutionContext,
): Promise<NodeExecutionResult> {
    const { config } = asNodeOfType(context.node, "script");
    const hooks: AgentRunHooks = { onEvent: (event) => context.onAgentEvent(event) };
    const workspace = await acquireItemWorkspace(context, hooks);

    const execution = await workspace.exec(config.command, {
        timeoutMs: config.timeoutMinutes * MS_PER_MINUTE,
        signal: context.signal,
        onOutput: (line) => context.onAgentEvent(rawLineEvent(context, line)),
    });

    return { outputs: { result: scriptResultOf(execution) } };
}

function rawLineEvent(context: NodeExecutionContext, line: string): AgentEvent {
    return { kind: "raw", line, at: context.clock.now(), iteration: context.nodeRun.iteration };
}

function scriptResultOf(execution: ExecResult): ExecResult {
    return {
        exitCode: execution.exitCode,
        stdoutTail: keepLastLines(execution.stdoutTail, STDOUT_TAIL_MAX_LINES),
    };
}

function keepLastLines(text: string, maxLines: number): string {
    return text.split(LINE_SEPARATOR).slice(-maxLines).join(LINE_SEPARATOR);
}
