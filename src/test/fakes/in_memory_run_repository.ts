import { resolveWith } from "@/lib/resolve_with.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RunState } from "@/engine/run_state.js";
import {
    ACTIVE_RUN_STATUSES,
    RunNotFoundError,
    findTransitionRunId,
    keepNodeRunsOfLatestRunPerItem,
} from "@/server/runs/run_repository.js";
import type {
    ArtifactRecord,
    ListRunsOptions,
    RunRecord,
    RunRepository,
    RunTransition,
} from "@/server/runs/run_repository.js";
import { parseJsonText } from "@/server/runs/run_rows.js";

export class InMemoryRunRepository implements RunRepository {
    private readonly runs = new Map<string, RunRecord>();
    private readonly nodeRuns = new Map<string, NodeRunState>();
    private readonly artifacts: ArtifactRecord[] = [];
    private readonly snapshotJsonByRunId = new Map<string, string>();

    createRun(run: RunRecord): Promise<void> {
        this.runs.set(run.id, structuredClone(run));
        return Promise.resolve();
    }

    // Everything is prepared before the first write, so a failure leaves the stored state untouched.
    saveTransition(change: RunTransition): Promise<void> {
        return resolveWith(() => {
            const runId = findTransitionRunId(change);
            const updatedRun = this.buildUpdatedRun(runId, change.run);
            const snapshotJson =
                change.snapshot === undefined ? undefined : JSON.stringify(change.snapshot);

            this.runs.set(runId, structuredClone(updatedRun));
            change.nodeRuns?.forEach((nodeRun) =>
                this.nodeRuns.set(nodeRun.id, structuredClone(nodeRun)),
            );
            this.artifacts.push(...structuredClone(change.artifacts ?? []));
            if (snapshotJson !== undefined) {
                this.snapshotJsonByRunId.set(runId, snapshotJson);
            }
        });
    }

    getRun(id: string): Promise<RunRecord | undefined> {
        return Promise.resolve(structuredClone(this.runs.get(id)));
    }

    listRuns(projectId: string, opts: ListRunsOptions): Promise<RunRecord[]> {
        const matchingRuns = runsAfterCursor(this.runsNewestFirst(), opts.before).filter(
            (run) =>
                run.projectId === projectId &&
                (opts.flowId === undefined || run.flowId === opts.flowId) &&
                hasAnyStatus(run, opts.status),
        );

        return Promise.resolve(structuredClone(matchingRuns.slice(0, opts.limit)));
    }

    listNodeRuns(runId: string): Promise<NodeRunState[]> {
        const nodeRunsOfRun = [...this.nodeRuns.values()].filter(
            (nodeRun) => nodeRun.runId === runId,
        );
        return Promise.resolve(structuredClone(nodeRunsOfRun));
    }

    getNodeRun(id: string): Promise<NodeRunState | undefined> {
        return Promise.resolve(structuredClone(this.nodeRuns.get(id)));
    }

    listArtifacts(nodeRunId: string): Promise<ArtifactRecord[]> {
        const artifactsOfNodeRun = this.artifacts.filter(
            (artifact) => artifact.nodeRunId === nodeRunId,
        );
        return Promise.resolve(structuredClone(artifactsOfNodeRun));
    }

    getSnapshot(runId: string): Promise<unknown> {
        const snapshotJson = this.snapshotJsonByRunId.get(runId);
        return Promise.resolve(
            snapshotJson === undefined ? undefined : parseJsonText(snapshotJson),
        );
    }

    listActiveRuns(): Promise<RunRecord[]> {
        const activeRuns = this.runsOldestFirst().filter((run) =>
            ACTIVE_RUN_STATUSES.includes(run.status),
        );
        return Promise.resolve(structuredClone(activeRuns));
    }

    latestNodeRunsByItem(
        projectId: string,
        itemIds: string[],
    ): Promise<Record<string, NodeRunState[]>> {
        const nodeRunsOldestRunFirst = this.runsOldestFirst()
            .filter((run) => run.projectId === projectId)
            .flatMap((run) =>
                [...this.nodeRuns.values()].filter((nodeRun) => nodeRun.runId === run.id),
            )
            .filter(
                (nodeRun) =>
                    nodeRun.workItemId !== undefined && itemIds.includes(nodeRun.workItemId),
            );

        return Promise.resolve(
            structuredClone(keepNodeRunsOfLatestRunPerItem(itemIds, nodeRunsOldestRunFirst)),
        );
    }

    private buildUpdatedRun(runId: string, run: RunState | undefined): RunRecord {
        const storedRun = this.runs.get(runId);
        if (!storedRun) {
            throw new RunNotFoundError(runId);
        }

        return run ? applyRunState(storedRun, run) : storedRun;
    }

    private runsOldestFirst(): RunRecord[] {
        return [...this.runs.values()].sort(compareCreationOrder);
    }

    private runsNewestFirst(): RunRecord[] {
        return this.runsOldestFirst().reverse();
    }
}

function applyRunState(storedRun: RunRecord, run: RunState): RunRecord {
    const { failedItems, ...state } = run;
    return {
        ...state,
        triggerId: storedRun.triggerId,
        itemIds: storedRun.itemIds,
        failedItemIds: failedItems ?? storedRun.failedItemIds,
    };
}

function compareCreationOrder(a: RunRecord, b: RunRecord): number {
    const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime();
    if (byCreatedAt !== 0) {
        return byCreatedAt;
    }

    return compareBinary(a.id, b.id);
}

// Same ordering as SQLite's default BINARY collation.
function compareBinary(a: string, b: string): number {
    if (a === b) {
        return 0;
    }

    return a < b ? -1 : 1;
}

// An unknown cursor matches nothing, as in the SQLite subquery.
function runsAfterCursor(runsNewestFirst: RunRecord[], before: string | undefined): RunRecord[] {
    if (before === undefined) {
        return runsNewestFirst;
    }

    const cursorIndex = runsNewestFirst.findIndex((run) => run.id === before);
    return cursorIndex === -1 ? [] : runsNewestFirst.slice(cursorIndex + 1);
}

function hasAnyStatus(run: RunRecord, statuses: RunRecord["status"][] | undefined): boolean {
    return statuses === undefined || statuses.length === 0 || statuses.includes(run.status);
}
