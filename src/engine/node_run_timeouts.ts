import type { FlowPlan } from "@/engine/flow_plan.js";
import type { NodeRunError, NodeRunState } from "@/engine/node_run_state.js";

export const TIMEOUT_TOTAL_ERROR: NodeRunError = {
    kind: "timeout_total",
    message: "O nó excedeu o tempo limite total",
};

// Remembers the NodeRuns canceled for running past their node's timeoutMinutes: the executor
// confirms that cancel as "canceled", but it must be recorded as a timeout.
export class NodeRunTimeouts {
    private readonly timedOutNodeRunIds: Set<string>;

    constructor(
        private readonly plan: FlowPlan,
        timedOutNodeRunIds: string[],
    ) {
        this.timedOutNodeRunIds = new Set(timedOutNodeRunIds);
    }

    timedOutIds(): string[] {
        return [...this.timedOutNodeRunIds];
    }

    // Undefined for nodes without a timeout.
    deadlineOf(nodeRun: NodeRunState): Date | undefined {
        const timeoutMs = this.plan.timeoutMsOf(nodeRun.nodeId);
        if (timeoutMs === undefined || !nodeRun.startedAt) {
            return undefined;
        }

        return new Date(nodeRun.startedAt.getTime() + timeoutMs);
    }

    // Returns each NodeRun once, the first time it is found past its deadline.
    markOverdue(runningNodeRuns: NodeRunState[], now: Date): NodeRunState[] {
        const newlyOverdue = runningNodeRuns.filter(
            (nodeRun) => !this.hasTimedOut(nodeRun.id) && this.isPastDeadline(nodeRun, now),
        );
        for (const nodeRun of newlyOverdue) {
            this.timedOutNodeRunIds.add(nodeRun.id);
        }

        return newlyOverdue;
    }

    hasTimedOut(nodeRunId: string): boolean {
        return this.timedOutNodeRunIds.has(nodeRunId);
    }

    private isPastDeadline(nodeRun: NodeRunState, now: Date): boolean {
        const deadline = this.deadlineOf(nodeRun);

        return deadline !== undefined && deadline.getTime() <= now.getTime();
    }
}
