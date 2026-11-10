import { z } from "zod";

import { NODE_RUN_ERROR_KINDS } from "@/engine/node_run_state.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import { RUN_PAUSE_REASONS } from "@/engine/run_state.js";
import type { RunState } from "@/engine/run_state.js";
import type { ArtifactRow, NodeRunRow, RunRow } from "@/server/db/schema/runs.js";
import { ARTIFACT_KINDS } from "@/server/runs/run_repository.js";
import type { ArtifactRecord, RunRecord } from "@/server/runs/run_repository.js";
import { NODE_RUN_STATUS_NAMES, RUN_STATUS_NAMES } from "@/shared/events.js";

const runStatusSchema = z.enum(RUN_STATUS_NAMES);
const nodeRunStatusSchema = z.enum(NODE_RUN_STATUS_NAMES);
const pauseReasonSchema = z.enum(RUN_PAUSE_REASONS);
const artifactKindSchema = z.enum(ARTIFACT_KINDS);
const idListSchema = z.array(z.string());
const namedValuesSchema = z.record(z.string(), z.unknown());

const groupPathSchema = z.array(
    z.object({ groupId: z.string(), iteration: z.number().int().optional() }),
);

const nodeRunErrorSchema = z.object({
    kind: z.enum(NODE_RUN_ERROR_KINDS),
    message: z.string(),
    isRetryable: z.literal(false).optional(),
});

type RunStateColumns = Omit<RunRow, "triggerId" | "itemIdsJson" | "failedItemIdsJson">;

export function toRunRow(run: RunRecord): RunRow {
    return {
        ...toRunStateColumns(run),
        triggerId: run.triggerId ?? null,
        itemIdsJson: JSON.stringify(run.itemIds),
        failedItemIdsJson: JSON.stringify(run.failedItemIds),
    };
}

export function toRunStateColumns(run: RunState): RunStateColumns {
    return {
        id: run.id,
        projectId: run.projectId,
        flowId: run.flowId,
        flowVersion: run.flowVersion,
        status: run.status,
        pauseReason: run.pauseReason ?? null,
        resumeAt: toIsoText(run.resumeAt),
        error: run.error ?? null,
        createdAt: run.createdAt.toISOString(),
        startedAt: toIsoText(run.startedAt),
        finishedAt: toIsoText(run.finishedAt),
    };
}

export function toRunRecord(row: RunRow): RunRecord {
    return {
        id: row.id,
        projectId: row.projectId,
        flowId: row.flowId,
        flowVersion: row.flowVersion,
        status: runStatusSchema.parse(row.status),
        pauseReason:
            row.pauseReason === null ? undefined : pauseReasonSchema.parse(row.pauseReason),
        resumeAt: toOptionalDate(row.resumeAt),
        triggerId: row.triggerId ?? undefined,
        itemIds: idListSchema.parse(JSON.parse(row.itemIdsJson)),
        failedItemIds: idListSchema.parse(JSON.parse(row.failedItemIdsJson)),
        error: row.error ?? undefined,
        createdAt: new Date(row.createdAt),
        startedAt: toOptionalDate(row.startedAt),
        finishedAt: toOptionalDate(row.finishedAt),
    };
}

export function toNodeRunRow(nodeRun: NodeRunState): NodeRunRow {
    return {
        id: nodeRun.id,
        runId: nodeRun.runId,
        nodeId: nodeRun.nodeId,
        workItemId: nodeRun.workItemId ?? null,
        iteration: nodeRun.iteration,
        attempt: nodeRun.attempt,
        groupPathJson: JSON.stringify(nodeRun.groupPath),
        status: nodeRun.status,
        errorJson: toOptionalJsonText(nodeRun.error),
        inputsJson: toOptionalJsonText(nodeRun.inputs),
        outputsJson: toOptionalJsonText(nodeRun.outputs),
        queuedAt: toIsoText(nodeRun.queuedAt),
        startedAt: toIsoText(nodeRun.startedAt),
        finishedAt: toIsoText(nodeRun.finishedAt),
    };
}

export function toNodeRunState(row: NodeRunRow): NodeRunState {
    return {
        id: row.id,
        runId: row.runId,
        nodeId: row.nodeId,
        workItemId: row.workItemId ?? undefined,
        iteration: row.iteration,
        attempt: row.attempt,
        groupPath: groupPathSchema.parse(JSON.parse(row.groupPathJson)),
        status: nodeRunStatusSchema.parse(row.status),
        error: parseOptionalJson(row.errorJson, nodeRunErrorSchema),
        inputs: parseOptionalJson(row.inputsJson, namedValuesSchema),
        outputs: parseOptionalJson(row.outputsJson, namedValuesSchema),
        queuedAt: toOptionalDate(row.queuedAt),
        startedAt: toOptionalDate(row.startedAt),
        finishedAt: toOptionalDate(row.finishedAt),
    };
}

export function toArtifactRow(artifact: ArtifactRecord): ArtifactRow {
    return {
        id: artifact.id,
        runId: artifact.runId,
        nodeRunId: artifact.nodeRunId,
        name: artifact.name,
        kind: artifact.kind,
        valueJson: JSON.stringify(artifact.value),
        createdAt: artifact.createdAt,
    };
}

export function toArtifactRecord(row: ArtifactRow): ArtifactRecord {
    return {
        id: row.id,
        runId: row.runId,
        nodeRunId: row.nodeRunId,
        name: row.name,
        kind: artifactKindSchema.parse(row.kind),
        value: parseJsonText(row.valueJson),
        createdAt: row.createdAt,
    };
}

export function parseJsonText(json: string): unknown {
    return JSON.parse(json);
}

function parseOptionalJson<T>(json: string | null, schema: z.ZodType<T>): T | undefined {
    return json === null ? undefined : schema.parse(JSON.parse(json));
}

function toOptionalJsonText(value: object | undefined): string | null {
    return value === undefined ? null : JSON.stringify(value);
}

function toIsoText(date: Date | undefined): string | null {
    return date?.toISOString() ?? null;
}

function toOptionalDate(isoText: string | null): Date | undefined {
    return isoText === null ? undefined : new Date(isoText);
}
