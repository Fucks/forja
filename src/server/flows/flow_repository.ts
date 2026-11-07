import { and, asc, eq, max, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

import type { ForjaDb } from "@/server/db/client.js";
import { flowVersions, flows } from "@/server/db/schema/flows.js";
import type { FlowRow, FlowVersionRow } from "@/server/db/schema/flows.js";
import { projects } from "@/server/db/schema/projects.js";
import { parseFlowGraph } from "@/shared/flow_graph.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type {
    FlowDraft,
    FlowSummary,
    FlowVersion,
    FlowVersionSummary,
} from "@/shared/flow_types.js";

const FIRST_DRAFT_REVISION = 1;

export interface NewFlow {
    id: string;
    projectId: string;
    name: string;
    graph: FlowGraph;
    createdAt: string;
}

export interface DraftReplacement {
    flowId: string;
    graph: FlowGraph;
    updatedAt: string;
}

export interface GuardedDraftReplacement extends DraftReplacement {
    expectedRevision: number;
}

export class FlowRepository {
    constructor(private readonly db: ForjaDb) {}

    projectExists(projectId: string): boolean {
        const row = this.db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.id, projectId))
            .get();
        return row !== undefined;
    }

    insert(flow: NewFlow): void {
        this.db
            .insert(flows)
            .values({
                id: flow.id,
                projectId: flow.projectId,
                name: flow.name,
                draftJson: JSON.stringify(flow.graph),
                draftRevision: FIRST_DRAFT_REVISION,
                draftUpdatedAt: flow.createdAt,
                createdAt: flow.createdAt,
            })
            .run();
    }

    listSummaries(projectId: string, options: { includeArchived: boolean }): FlowSummary[] {
        const ofProject = eq(flows.projectId, projectId);
        const condition = options.includeArchived
            ? ofProject
            : and(ofProject, eq(flows.archived, false));
        return this.selectSummaries(condition);
    }

    findSummary(flowId: string): FlowSummary | undefined {
        return this.selectSummaries(eq(flows.id, flowId)).at(0);
    }

    findDraft(flowId: string): FlowDraft | undefined {
        const row = this.db.select().from(flows).where(eq(flows.id, flowId)).get();
        return row && toFlowDraft(row);
    }

    rename(flowId: string, name: string): void {
        this.db.update(flows).set({ name }).where(eq(flows.id, flowId)).run();
    }

    archive(flowId: string): void {
        this.db.update(flows).set({ archived: true }).where(eq(flows.id, flowId)).run();
    }

    markAsDefault(flow: Pick<FlowSummary, "id" | "projectId">): void {
        this.db.transaction((transaction) => {
            transaction
                .update(flows)
                .set({ isDefault: false })
                .where(eq(flows.projectId, flow.projectId))
                .run();
            transaction.update(flows).set({ isDefault: true }).where(eq(flows.id, flow.id)).run();
        });
    }

    replaceDraftIfRevisionMatches(replacement: GuardedDraftReplacement): boolean {
        const result = this.db
            .update(flows)
            .set(toNextDraftColumns(replacement))
            .where(
                and(
                    eq(flows.id, replacement.flowId),
                    eq(flows.draftRevision, replacement.expectedRevision),
                ),
            )
            .run();
        return result.changes > 0;
    }

    replaceDraft(replacement: DraftReplacement): void {
        this.db
            .update(flows)
            .set(toNextDraftColumns(replacement))
            .where(eq(flows.id, replacement.flowId))
            .run();
    }

    insertVersion(version: FlowVersion): void {
        this.db
            .insert(flowVersions)
            .values({
                flowId: version.flowId,
                version: version.version,
                graphJson: JSON.stringify(version.graph),
                publishedAt: version.publishedAt,
                note: version.note ?? null,
            })
            .run();
    }

    findVersion(flowId: string, version: number): FlowVersion | undefined {
        const row = this.db
            .select()
            .from(flowVersions)
            .where(and(eq(flowVersions.flowId, flowId), eq(flowVersions.version, version)))
            .get();
        return row && toFlowVersion(row);
    }

    listVersions(flowId: string): FlowVersionSummary[] {
        return this.db
            .select()
            .from(flowVersions)
            .where(eq(flowVersions.flowId, flowId))
            .orderBy(asc(flowVersions.version))
            .all()
            .map(toFlowVersionSummary);
    }

    private selectSummaries(condition: SQL | undefined): FlowSummary[] {
        return this.db
            .select({ flow: flows, latestVersion: max(flowVersions.version) })
            .from(flows)
            .leftJoin(flowVersions, eq(flowVersions.flowId, flows.id))
            .where(condition)
            .groupBy(flows.id)
            .orderBy(asc(flows.createdAt), asc(flows.id))
            .all()
            .map(({ flow, latestVersion }) => toFlowSummary(flow, latestVersion));
    }
}

function toNextDraftColumns(replacement: DraftReplacement): SQLiteUpdateSetSource<typeof flows> {
    return {
        draftJson: JSON.stringify(replacement.graph),
        draftRevision: sql`${flows.draftRevision} + 1`,
        draftUpdatedAt: replacement.updatedAt,
    };
}

function toFlowSummary(row: FlowRow, latestVersion: number | null): FlowSummary {
    return {
        id: row.id,
        projectId: row.projectId,
        name: row.name,
        isDefault: row.isDefault,
        archived: row.archived,
        latestVersion: latestVersion ?? undefined,
        draftUpdatedAt: row.draftUpdatedAt,
        draftRevision: row.draftRevision,
    };
}

function toFlowDraft(row: FlowRow): FlowDraft {
    return {
        flowId: row.id,
        graph: parseFlowGraph(JSON.parse(row.draftJson)),
        revision: row.draftRevision,
        updatedAt: row.draftUpdatedAt,
    };
}

function toFlowVersion(row: FlowVersionRow): FlowVersion {
    return { ...toFlowVersionSummary(row), graph: parseFlowGraph(JSON.parse(row.graphJson)) };
}

function toFlowVersionSummary(row: FlowVersionRow): FlowVersionSummary {
    return {
        flowId: row.flowId,
        version: row.version,
        publishedAt: row.publishedAt,
        note: row.note ?? undefined,
    };
}
