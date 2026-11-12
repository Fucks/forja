import type { NodeRunState } from "@/engine/node_run_state.js";
import { describeItem } from "@/web/canvas/live/run_view_model.js";

// The live view holds serialized NodeRuns; only these fields matter to order and describe them.
type NodeRunPosition = Pick<NodeRunState, "status" | "workItemId" | "iteration" | "attempt">;

const OUTSIDE_LOOPS = 0;
const DESCRIPTION_SEPARATOR = " · ";
const RUNNING_RANK = 0;
const NOT_RUNNING_RANK = 1;

const itemNumberOrder = new Intl.Collator(undefined, { numeric: true });

export function sortNodeRuns<NodeRun extends NodeRunPosition>(nodeRuns: NodeRun[]): NodeRun[] {
    return [...nodeRuns].sort(
        (a, b) => compareRunningFirst(a, b) || compareItems(a, b) || compareLatestFirst(a, b),
    );
}

function compareRunningFirst(a: NodeRunPosition, b: NodeRunPosition): number {
    return runningRankOf(a) - runningRankOf(b);
}

function runningRankOf(nodeRun: NodeRunPosition): number {
    return nodeRun.status === "RUNNING" ? RUNNING_RANK : NOT_RUNNING_RANK;
}

// A NodeRun without an item runs once for every item, so it comes before them.
function compareItems(a: NodeRunPosition, b: NodeRunPosition): number {
    return itemNumberOrder.compare(a.workItemId ?? "", b.workItemId ?? "");
}

function compareLatestFirst(a: NodeRunPosition, b: NodeRunPosition): number {
    return b.iteration - a.iteration || b.attempt - a.attempt;
}

export function describeNodeRun(nodeRun: NodeRunPosition): string {
    const parts = [
        nodeRun.workItemId === undefined ? undefined : describeItem(nodeRun.workItemId),
        nodeRun.iteration === OUTSIDE_LOOPS ? undefined : `iteração ${nodeRun.iteration}`,
        `tentativa ${nodeRun.attempt}`,
    ];

    return parts.filter((part) => part !== undefined).join(DESCRIPTION_SEPARATOR);
}
