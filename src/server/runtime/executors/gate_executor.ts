import type { AgentRunHooks } from "@/integrations/agent_runtime/agent_runtime.js";
import type { ApprovalService } from "@/server/approvals/approval_service.js";
import { acquireItemWorkspace } from "@/server/runtime/executors/item_workspace.js";
import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import type {
    NodeExecutionContext,
    NodeExecutor,
    WaitingForApproval,
} from "@/server/runtime/node_executors.js";
import type { GateConfig } from "@/shared/node_configs/gate_config.js";

export const MAX_APPROVAL_DIFF_BYTES = 200 * 1024;

const HOUR_MS = 60 * 60 * 1_000;

export interface GateExecutorDeps {
    approvals: Pick<ApprovalService, "create">;
}

export function createGateExecutor(deps: GateExecutorDeps): NodeExecutor<WaitingForApproval> {
    return async (context) => {
        const { config } = asNodeOfType(context.node, "gate");
        const expiresAt = expiresAtOf(context, config);
        const approval = await deps.approvals.create({
            projectId: context.run.projectId,
            runId: context.run.id,
            nodeRunId: context.nodeRun.id,
            workItemId: context.nodeRun.workItemId,
            message: config.message,
            show: config.show,
            diff: await captureDiff(context, config),
            expiresAt: expiresAt?.toISOString(),
        });

        return { waiting: "approval", approvalId: approval.id, expiresAt };
    };
}

function expiresAtOf(context: NodeExecutionContext, config: GateConfig): Date | undefined {
    if (config.timeoutHours === undefined) {
        return undefined;
    }

    return new Date(context.clock.now().getTime() + config.timeoutHours * HOUR_MS);
}

// Only an item has a branch to compare with the base.
async function captureDiff(
    context: NodeExecutionContext,
    config: GateConfig,
): Promise<string | undefined> {
    if (!config.show.includes("diff") || !context.item) {
        return undefined;
    }

    const hooks: AgentRunHooks = { onEvent: (event) => context.onAgentEvent(event) };
    const workspace = await acquireItemWorkspace(context, hooks);

    return truncateDiff(await workspace.diff(context.project.baseBranch));
}

function truncateDiff(diff: string): string {
    const diffBytes = Buffer.from(diff);
    if (diffBytes.byteLength <= MAX_APPROVAL_DIFF_BYTES) {
        return diff;
    }

    return diffBytes.subarray(0, MAX_APPROVAL_DIFF_BYTES).toString("utf8");
}
