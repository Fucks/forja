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
    private readonly nodeRunIdsByNodeAndItem = new Map<string, string>();

    constructor(nodeRuns: NodeRunState[]) {
        nodeRuns.forEach((nodeRun) => this.save(nodeRun));
    }

    save(nodeRun: NodeRunState): void {
        this.nodeRunsById.set(nodeRun.id, nodeRun);
        this.nodeRunIdsByNodeAndItem.set(
            nodeAndItemKey(nodeRun.nodeId, nodeRun.workItemId),
            nodeRun.id,
        );
    }

    get(nodeRunId: string): NodeRunState {
        const nodeRun = this.nodeRunsById.get(nodeRunId);
        if (!nodeRun) {
            throw new UnknownNodeRunError(nodeRunId);
        }

        return nodeRun;
    }

    find(nodeId: string, workItemId: string | undefined): NodeRunState | undefined {
        const nodeRunId = this.nodeRunIdsByNodeAndItem.get(nodeAndItemKey(nodeId, workItemId));
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
