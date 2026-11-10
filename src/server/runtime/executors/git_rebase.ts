import { AgentRuntimeError } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentRunHooks,
    ExecOptions,
    Workspace,
} from "@/integrations/agent_runtime/agent_runtime.js";
import { quoteShellArgument } from "@/lib/shell_quote.js";
import { executeAgentNode } from "@/server/runtime/executors/agent_executor.js";
import { acquireItemWorkspace } from "@/server/runtime/executors/item_workspace.js";
import { buildRebaserNode, type GitNode } from "@/server/runtime/executors/rebaser_node.js";
import type { ModelUsage, NodeExecutionContext } from "@/server/runtime/node_executors.js";

const REMOTE = "origin";
const GIT_COMMAND_TIMEOUT_MS = 300_000;
const CONFLICTED_FILES_COMMAND = "git diff --name-only --diff-filter=U";
const REBASE_FINISHED_COMMAND =
    'test ! -d "$(git rev-parse --git-path rebase-merge)" && ' +
    'test ! -d "$(git rev-parse --git-path rebase-apply)"';
const LINE_BREAK = /\r?\n/;

export class UnresolvedConflictsError extends AgentRuntimeError {
    constructor(conflictedFiles: string[]) {
        const fileList = conflictedFiles.length === 0 ? "" : `: ${conflictedFiles.join(", ")}`;
        super(`O rebase parou com conflitos não resolvidos${fileList}`);
        this.name = "UnresolvedConflictsError";
    }
}

/**
 * Rebases the branch of the item onto the base on origin; when it stops on conflicts, an agent
 * resolves them. Returns the tokens of that agent, if it ran.
 * @throws UnresolvedConflictsError
 */
export async function rebaseItemBranch(
    context: NodeExecutionContext,
    node: GitNode,
    baseBranch: string,
): Promise<ModelUsage | undefined> {
    const workspace = await acquireItemWorkspace(context, agentHooksOf(context));
    const rebase = await workspace.exec(rebaseCommand(baseBranch), execOptionsOf(context));
    if (rebase.exitCode === 0) {
        return undefined;
    }

    const usage = await resolveConflictsWithAgent(context, node, baseBranch);
    await assertRebaseFinished(workspace, context);

    return usage;
}

export function remoteRefOf(branch: string): string {
    return `${REMOTE}/${branch}`;
}

function rebaseCommand(baseBranch: string): string {
    const fetch = `git fetch ${REMOTE} ${quoteShellArgument(baseBranch)}`;
    const rebase = `git rebase ${quoteShellArgument(remoteRefOf(baseBranch))}`;

    return `${fetch} && ${rebase}`;
}

// The prompt names the base of this node, which may not be the project's.
async function resolveConflictsWithAgent(
    context: NodeExecutionContext,
    node: GitNode,
    baseBranch: string,
): Promise<ModelUsage | undefined> {
    const resolution = await executeAgentNode({
        ...context,
        node: buildRebaserNode(node),
        project: { ...context.project, baseBranch },
    });

    return resolution.usage;
}

async function assertRebaseFinished(
    workspace: Workspace,
    context: NodeExecutionContext,
): Promise<void> {
    const [conflictedFiles, rebaseFinished] = await Promise.all([
        workspace.exec(CONFLICTED_FILES_COMMAND, execOptionsOf(context)),
        workspace.exec(REBASE_FINISHED_COMMAND, execOptionsOf(context)),
    ]);
    const filesStillInConflict = linesOf(conflictedFiles.stdoutTail);
    if (filesStillInConflict.length > 0 || rebaseFinished.exitCode !== 0) {
        throw new UnresolvedConflictsError(filesStillInConflict);
    }
}

function agentHooksOf(context: NodeExecutionContext): AgentRunHooks {
    return { onEvent: (event) => context.onAgentEvent(event) };
}

function execOptionsOf(context: NodeExecutionContext): ExecOptions {
    return { timeoutMs: GIT_COMMAND_TIMEOUT_MS, signal: context.signal };
}

function linesOf(text: string): string[] {
    return text.split(LINE_BREAK).filter((line) => line.trim() !== "");
}
