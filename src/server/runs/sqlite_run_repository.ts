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
import type { ArtifactKind } from "@/shared/run_types.js";

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

    saveTransition(transition: RunTransition): Promise<void> {
        return resolveWith(() => {
            const runId = findTransitionRunId(transition);
            this.db.transaction(() => this.writeTransition(runId, transition));
        });
    }

    getRun(id: string): Promise<RunRecord | undefined> {
        return resolveWith(() => {
            const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
            return row && toRunRecord(row);
        });
    }

    listRuns(projectId: string, options: ListRunsOptions): Promise<RunRecord[]> {
        return resolveWith(() =>
            this.db
                .select()
                .from(runs)
                .where(and(...buildListRunsConditions(projectId, options)))
                .orderBy(desc(runs.createdAt), desc(runs.id))
                .limit(options.limit)
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

    listNodeRunsOfItem(itemId: string): Promise<NodeRunState[]> {
        return resolveWith(() =>
            this.db
                .select({ nodeRun: nodeRuns })
                .from(nodeRuns)
                .innerJoin(runs, eq(runs.id, nodeRuns.runId))
                .where(eq(nodeRuns.workItemId, itemId))
                .orderBy(asc(runs.createdAt), asc(runs.id), NODE_RUN_INSERTION_ORDER)
                .all()
                .map(({ nodeRun }) => toNodeRunState(nodeRun)),
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

    listItemIdsWithArtifact(projectId: string, kind: ArtifactKind): Promise<string[]> {
        return resolveWith(() =>
            this.db
                .selectDistinct({ itemId: nodeRuns.workItemId })
                .from(artifacts)
                .innerJoin(nodeRuns, eq(nodeRuns.id, artifacts.nodeRunId))
                .innerJoin(runs, eq(runs.id, nodeRuns.runId))
                .where(and(eq(runs.projectId, projectId), eq(artifacts.kind, kind)))
                .all()
                .flatMap(({ itemId }) => (itemId === null ? [] : [itemId])),
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

    private writeTransition(runId: string, transition: RunTransition): void {
        this.assertRunExists(runId);
        if (transition.run) {
            this.updateRunState(transition.run);
        }
        transition.nodeRuns?.forEach((nodeRun) => this.upsertNodeRun(nodeRun));
        transition.artifacts?.forEach((artifact) => this.insertArtifact(artifact));
        if (transition.snapshot !== undefined) {
            this.saveSnapshot(runId, transition.snapshot);
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

function buildListRunsConditions(projectId: string, options: ListRunsOptions): SQL[] {
    const conditions = [eq(runs.projectId, projectId)];
    if (options.flowId !== undefined) {
        conditions.push(eq(runs.flowId, options.flowId));
    }
    if (options.status && options.status.length > 0) {
        conditions.push(inArray(runs.status, options.status));
    }
    if (options.before !== undefined) {
        conditions.push(olderThanRun(options.before));
    }

    return conditions;
}

function olderThanRun(runId: string): SQL {
    const cursor = sql`(SELECT created_at, id FROM runs WHERE id = ${runId})`;
    return sql`(${runs.createdAt}, ${runs.id}) < ${cursor}`;
}
