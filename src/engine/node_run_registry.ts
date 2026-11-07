import { NODE_RUN_TERMINAL, type NodeRunState } from "@/engine/node_run_state.js";
import type { NodeRunStatusName } from "@/shared/events.js";

export class UnknownNodeRunError extends Error {
    constructor(readonly nodeRunId: string) {
        super(`NodeRun ${nodeRunId} is not part of this run`);
        this.name = "UnknownNodeRunError";
    }
}

export class NodeRunRegistry {
    private readonly nodeRunsById = new Map<string, NodeRunState>();
    private readonly latestNodeRunIdsByNodeAndItem = new Map<string, string>();

    constructor(nodeRuns: NodeRunState[]) {
        nodeRuns.forEach((nodeRun) => this.save(nodeRun));
    }

    save(nodeRun: NodeRunState): void {
        const latest = this.find(nodeRun.nodeId, nodeRun.workItemId);
        this.nodeRunsById.set(nodeRun.id, nodeRun);
        if (!latest || latest.iteration <= nodeRun.iteration) {
            const key = nodeAndItemKey(nodeRun.nodeId, nodeRun.workItemId);
            this.latestNodeRunIdsByNodeAndItem.set(key, nodeRun.id);
        }
    }

    get(nodeRunId: string): NodeRunState {
        const nodeRun = this.nodeRunsById.get(nodeRunId);
        if (!nodeRun) {
            throw new UnknownNodeRunError(nodeRunId);
        }

        return nodeRun;
    }

    // The NodeRun of the latest loop iteration of the node for the item.
    find(nodeId: string, workItemId: string | undefined): NodeRunState | undefined {
        const nodeRunId = this.latestNodeRunIdsByNodeAndItem.get(
            nodeAndItemKey(nodeId, workItemId),
        );
        if (nodeRunId === undefined) {
            return undefined;
        }

        return this.nodeRunsById.get(nodeRunId);
    }

    all(): NodeRunState[] {
        return [...this.nodeRunsById.values()];
    }

    withStatus(...statuses: NodeRunStatusName[]): NodeRunState[] {
        return this.all().filter((nodeRun) => statuses.includes(nodeRun.status));
    }

    areAllTerminal(): boolean {
        return this.all().every((nodeRun) => NODE_RUN_TERMINAL.has(nodeRun.status));
    }
}

function nodeAndItemKey(nodeId: string, workItemId: string | undefined): string {
    return JSON.stringify([nodeId, workItemId ?? null]);
}
