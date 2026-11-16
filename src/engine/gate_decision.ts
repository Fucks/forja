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
        [decision]: decisionValueOf(gate),
        [GATE_COMMENT_PORT]: comment ?? "",
    };
}

// Inside a map the item port may stay unwired, since the item is implicit. The decision port then
// carries the gate's own item: an `undefined` value would vanish once the outputs are saved, and
// a retry downstream would take the decision for the branch that was not chosen.
function decisionValueOf(gate: NodeRunState): unknown {
    const item = gate.inputs?.[GATE_ITEM_PORT];
    if (item !== undefined) {
        return item;
    }

    return gate.workItemId === undefined ? true : { id: gate.workItemId };
}
