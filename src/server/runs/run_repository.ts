import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RunState } from "@/engine/run_state.js";
import type { RunStatusName } from "@/shared/events.js";

export const ARTIFACT_KINDS = ["text", "json", "branch", "pr_url"] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const ACTIVE_RUN_STATUSES: readonly RunStatusName[] = ["QUEUED", "RUNNING", "PAUSED"];

export interface RunRecord extends RunState {
    triggerId?: string;
    itemIds: string[];
    failedItemIds: string[];
}

export interface ArtifactRecord {
    id: string;
    nodeRunId: string;
    runId: string;
    name: string;
    kind: ArtifactKind;
    value: unknown;
    createdAt: string;
}

export interface RunTransition {
    run?: RunState;
    nodeRuns?: NodeRunState[];
    artifacts?: ArtifactRecord[];
    snapshot?: unknown;
}

export interface ListRunsOptions {
    limit: number;
    // Id of the last run of the previous page.
    before?: string;
    flowId?: string;
    status?: RunStatusName[];
}

export interface RunRepository {
    createRun(run: RunRecord): Promise<void>;
    // Everything in the transition is saved in one transaction, or nothing is.
    saveTransition(change: RunTransition): Promise<void>;
    getRun(id: string): Promise<RunRecord | undefined>;
    listRuns(projectId: string, opts: ListRunsOptions): Promise<RunRecord[]>;
    listNodeRuns(runId: string): Promise<NodeRunState[]>;
    getNodeRun(id: string): Promise<NodeRunState | undefined>;
    listArtifacts(nodeRunId: string): Promise<ArtifactRecord[]>;
    getSnapshot(runId: string): Promise<unknown>;
    listActiveRuns(): Promise<RunRecord[]>;
    latestNodeRunsByItem(
        projectId: string,
        itemIds: string[],
    ): Promise<Record<string, NodeRunState[]>>;
}

export class RunNotFoundError extends Error {
    constructor(readonly runId: string) {
        super(`Run ${runId} not found`);
        this.name = "RunNotFoundError";
    }
}

export class TransitionWithoutRunError extends Error {
    constructor() {
        super("A run transition must name its run through the run, a NodeRun or an artifact");
        this.name = "TransitionWithoutRunError";
    }
}

export function findTransitionRunId(change: RunTransition): string {
    const runId = change.run?.id ?? change.nodeRuns?.at(0)?.runId ?? change.artifacts?.at(0)?.runId;
    if (runId === undefined) {
        throw new TransitionWithoutRunError();
    }

    return runId;
}

export function keepNodeRunsOfLatestRunPerItem(
    itemIds: string[],
    nodeRunsOldestRunFirst: NodeRunState[],
): Record<string, NodeRunState[]> {
    const latestRunIdByItem = new Map(
        nodeRunsOldestRunFirst.map((nodeRun) => [nodeRun.workItemId, nodeRun.runId]),
    );
    const nodeRunsOfLatestRun = (itemId: string): NodeRunState[] =>
        nodeRunsOldestRunFirst.filter(
            (nodeRun) =>
                nodeRun.workItemId === itemId && nodeRun.runId === latestRunIdByItem.get(itemId),
        );

    return Object.fromEntries(itemIds.map((itemId) => [itemId, nodeRunsOfLatestRun(itemId)]));
}
