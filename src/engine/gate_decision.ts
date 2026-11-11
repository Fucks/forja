import type { NodeRunState } from "@/engine/node_run_state.js";
import type { ApprovalDecision } from "@/shared/approval_types.js";

export const APPROVAL_TIMEOUT_COMMENT = "tempo esgotado";

const GATE_ITEM_PORT = "item";
const GATE_COMMENT_PORT = "comment";

// The answer may arrive while the gate is still RUNNING, before it reports that it waits.
export function isAwaitingDecision(gate: NodeRunState): boolean {
    return gate.status === "WAITING_APPROVAL" || gate.status === "RUNNING";
}

// Only the port of the decision gets the item, so the scheduler skips the other branch. The
// comment is always filled, so a node wired to it is not skipped for the lack of one.
export function gateOutputsOf(
    gate: NodeRunState,
    decision: ApprovalDecision,
    comment: string | undefined,
): Record<string, unknown> {
    return {
        [decision]: gate.inputs?.[GATE_ITEM_PORT],
        [GATE_COMMENT_PORT]: comment ?? "",
    };
}
