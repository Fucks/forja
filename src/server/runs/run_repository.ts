import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RunState } from "@/engine/run_state.js";
import type { RunStatusName } from "@/shared/events.js";
import type { ArtifactKind, SerializedArtifact } from "@/shared/run_types.js";

export const ACTIVE_RUN_STATUSES: readonly RunStatusName[] = ["QUEUED", "RUNNING", "PAUSED"];

export interface RunRecord extends RunState {
    triggerId?: string;
    itemIds: string[];
    failedItemIds: string[];
}

// An artifact holds only JSON, so the API sends the record as it is stored.
export type ArtifactRecord = SerializedArtifact;

export interface RunTransition {
    // The engine reports map failures as failedItems; when set, they replace failedItemIds.
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
    saveTransition(transition: RunTransition): Promise<void>;
    getRun(id: string): Promise<RunRecord | undefined>;
    listRuns(projectId: string, options: ListRunsOptions): Promise<RunRecord[]>;
    listNodeRuns(runId: string): Promise<NodeRunState[]>;
    // Oldest run first; inside a run, in the order the NodeRuns were saved.
    listNodeRunsOfItem(itemId: string): Promise<NodeRunState[]>;
    getNodeRun(id: string): Promise<NodeRunState | undefined>;
    listArtifacts(nodeRunId: string): Promise<ArtifactRecord[]>;
    listItemIdsWithArtifact(projectId: string, kind: ArtifactKind): Promise<string[]>;
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

export function findTransitionRunId(transition: RunTransition): string {
    const runId =
        transition.run?.id ??
        transition.nodeRuns?.at(0)?.runId ??
        transition.artifacts?.at(0)?.runId;
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

export async function listArtifactsOfNodeRuns(
    runs: Pick<RunRepository, "listArtifacts">,
    nodeRuns: NodeRunState[],
): Promise<ArtifactRecord[]> {
    const artifactsByNodeRun = await Promise.all(
        nodeRuns.map((nodeRun) => runs.listArtifacts(nodeRun.id)),
    );
    return artifactsByNodeRun.flat();
}
