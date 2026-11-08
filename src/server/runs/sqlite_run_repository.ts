import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RunState } from "@/engine/run_state.js";
import type { Clock } from "@/lib/clock.js";
import { resolveWith } from "@/lib/resolve_with.js";
import type { ForjaDb } from "@/server/db/client.js";
import { artifacts, nodeRuns, runSnapshots, runs } from "@/server/db/schema/runs.js";
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
import {
    parseJsonText,
    toArtifactRecord,
    toArtifactRow,
    toNodeRunRow,
    toNodeRunState,
    toRunRecord,
    toRunRow,
    toRunStateColumns,
} from "@/server/runs/run_rows.js";

const NODE_RUN_INSERTION_ORDER = sql`${nodeRuns}.rowid`;
const ARTIFACT_INSERTION_ORDER = sql`${artifacts}.rowid`;

export class SqliteRunRepository implements RunRepository {
    constructor(
        private readonly db: ForjaDb,
        private readonly clock: Clock,
    ) {}

    createRun(run: RunRecord): Promise<void> {
        return resolveWith(() => {
            this.db.insert(runs).values(toRunRow(run)).run();
        });
    }

    saveTransition(change: RunTransition): Promise<void> {
        return resolveWith(() => {
            const runId = findTransitionRunId(change);
            this.db.transaction(() => this.writeTransition(runId, change));
        });
    }

    getRun(id: string): Promise<RunRecord | undefined> {
        return resolveWith(() => {
            const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
            return row && toRunRecord(row);
        });
    }

    listRuns(projectId: string, opts: ListRunsOptions): Promise<RunRecord[]> {
        return resolveWith(() =>
            this.db
                .select()
                .from(runs)
                .where(and(...listRunsConditions(projectId, opts)))
                .orderBy(desc(runs.createdAt), desc(runs.id))
                .limit(opts.limit)
                .all()
                .map(toRunRecord),
        );
    }

    listNodeRuns(runId: string): Promise<NodeRunState[]> {
        return resolveWith(() =>
            this.db
                .select()
                .from(nodeRuns)
                .where(eq(nodeRuns.runId, runId))
                .orderBy(NODE_RUN_INSERTION_ORDER)
                .all()
                .map(toNodeRunState),
        );
    }

    getNodeRun(id: string): Promise<NodeRunState | undefined> {
        return resolveWith(() => {
            const row = this.db.select().from(nodeRuns).where(eq(nodeRuns.id, id)).get();
            return row && toNodeRunState(row);
        });
    }

    listArtifacts(nodeRunId: string): Promise<ArtifactRecord[]> {
        return resolveWith(() =>
            this.db
                .select()
                .from(artifacts)
                .where(eq(artifacts.nodeRunId, nodeRunId))
                .orderBy(ARTIFACT_INSERTION_ORDER)
                .all()
                .map(toArtifactRecord),
        );
    }

    getSnapshot(runId: string): Promise<unknown> {
        return resolveWith(() => {
            const row = this.db
                .select({ json: runSnapshots.json })
                .from(runSnapshots)
                .where(eq(runSnapshots.runId, runId))
                .get();
            return row && parseJsonText(row.json);
        });
    }

    listActiveRuns(): Promise<RunRecord[]> {
        return resolveWith(() =>
            this.db
                .select()
                .from(runs)
                .where(inArray(runs.status, [...ACTIVE_RUN_STATUSES]))
                .orderBy(asc(runs.createdAt), asc(runs.id))
                .all()
                .map(toRunRecord),
        );
    }

    latestNodeRunsByItem(
        projectId: string,
        itemIds: string[],
    ): Promise<Record<string, NodeRunState[]>> {
        return resolveWith(() => {
            const nodeRunsOldestRunFirst = this.db
                .select({ nodeRun: nodeRuns })
                .from(nodeRuns)
                .innerJoin(runs, eq(runs.id, nodeRuns.runId))
                .where(and(eq(runs.projectId, projectId), inArray(nodeRuns.workItemId, itemIds)))
                .orderBy(asc(runs.createdAt), asc(runs.id), NODE_RUN_INSERTION_ORDER)
                .all()
                .map(({ nodeRun }) => toNodeRunState(nodeRun));
            return keepNodeRunsOfLatestRunPerItem(itemIds, nodeRunsOldestRunFirst);
        });
    }

    private writeTransition(runId: string, change: RunTransition): void {
        this.assertRunExists(runId);
        if (change.run) {
            this.updateRunState(change.run);
        }
        change.nodeRuns?.forEach((nodeRun) => this.upsertNodeRun(nodeRun));
        change.artifacts?.forEach((artifact) => this.insertArtifact(artifact));
        if (change.snapshot !== undefined) {
            this.saveSnapshot(runId, change.snapshot);
        }
    }

    private assertRunExists(runId: string): void {
        const row = this.db.select({ id: runs.id }).from(runs).where(eq(runs.id, runId)).get();
        if (!row) {
            throw new RunNotFoundError(runId);
        }
    }

    private updateRunState(run: RunState): void {
        const failedItemsColumn =
            run.failedItems === undefined
                ? {}
                : { failedItemIdsJson: JSON.stringify(run.failedItems) };
        this.db
            .update(runs)
            .set({ ...toRunStateColumns(run), ...failedItemsColumn })
            .where(eq(runs.id, run.id))
            .run();
    }

    private upsertNodeRun(nodeRun: NodeRunState): void {
        const row = toNodeRunRow(nodeRun);
        this.db
            .insert(nodeRuns)
            .values(row)
            .onConflictDoUpdate({ target: nodeRuns.id, set: row })
            .run();
    }

    private insertArtifact(artifact: ArtifactRecord): void {
        this.db.insert(artifacts).values(toArtifactRow(artifact)).run();
    }

    private saveSnapshot(runId: string, snapshot: unknown): void {
        const row = {
            runId,
            json: JSON.stringify(snapshot),
            updatedAt: this.clock.now().toISOString(),
        };
        this.db
            .insert(runSnapshots)
            .values(row)
            .onConflictDoUpdate({ target: runSnapshots.runId, set: row })
            .run();
    }
}

function listRunsConditions(projectId: string, opts: ListRunsOptions): SQL[] {
    const conditions = [eq(runs.projectId, projectId)];
    if (opts.flowId !== undefined) {
        conditions.push(eq(runs.flowId, opts.flowId));
    }
    if (opts.status && opts.status.length > 0) {
        conditions.push(inArray(runs.status, opts.status));
    }
    if (opts.before !== undefined) {
        conditions.push(olderThanRun(opts.before));
    }

    return conditions;
}

function olderThanRun(runId: string): SQL {
    return sql`(${runs.createdAt}, ${runs.id}) < (SELECT created_at, id FROM runs WHERE id = ${runId})`;
}
