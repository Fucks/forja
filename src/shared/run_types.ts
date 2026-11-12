import { z } from "zod";

import type { MapProgress } from "@/engine/map_group.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RunState } from "@/engine/run_state.js";
import type { JsonDates } from "@/engine/scheduler_types.js";
import { RUN_STATUS_NAMES } from "@/shared/events.js";
import type { FlowGraph } from "@/shared/flow_graph.js";

export const ARTIFACT_KINDS = ["text", "json", "branch", "pr_url"] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

const MAX_ITEMS_PER_RUN = 100;
const DEFAULT_RUNS_PAGE_SIZE = 50;
const MAX_RUNS_PAGE_SIZE = 100;

export const startRunInput = z.object({
    flowId: z.string(),
    version: z.number().int().optional(),
    itemIds: z.array(z.string()).max(MAX_ITEMS_PER_RUN).default([]),
});

export type StartRunRequest = z.infer<typeof startRunInput>;

const runStatusSchema = z.enum(RUN_STATUS_NAMES);

// A query string repeats the key for many values, and sends a single value as a plain string.
const runStatusesSchema = z
    .union([runStatusSchema, z.array(runStatusSchema)])
    .transform((statuses) => (Array.isArray(statuses) ? statuses : [statuses]));

export const listRunsQuery = z.object({
    limit: z.coerce
        .number()
        .int()
        .positive()
        .max(MAX_RUNS_PAGE_SIZE)
        .default(DEFAULT_RUNS_PAGE_SIZE),
    before: z.string().min(1).optional(),
    flowId: z.string().min(1).optional(),
    status: runStatusesSchema.optional(),
});

export type ListRunsRequest = z.infer<typeof listRunsQuery>;

const budgetLimitSchema = z.object({
    maxCostUsd: z.number().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
});

export const raiseRunBudgetInput = z.object({ run: budgetLimitSchema.optional() });

export type RaiseRunBudgetRequest = z.infer<typeof raiseRunBudgetInput>;

// What the API sends: the dates of the run and its NodeRuns travel as ISO strings.
export type SerializedRunRecord = JsonDates<RunState> & {
    triggerId?: string;
    itemIds: string[];
    failedItemIds: string[];
};

export type SerializedNodeRun = JsonDates<NodeRunState>;

export interface SerializedRunView {
    run: SerializedRunRecord & { flowName: string };
    nodeRuns: SerializedNodeRun[];
    groups: Record<string, MapProgress>;
    graph: FlowGraph;
    lastEventId: number;
}

export interface SerializedArtifact {
    id: string;
    nodeRunId: string;
    runId: string;
    name: string;
    kind: ArtifactKind;
    value: unknown;
    createdAt: string;
}

export interface SerializedNodeRunDetail {
    nodeRun: SerializedNodeRun;
    artifacts: SerializedArtifact[];
}
