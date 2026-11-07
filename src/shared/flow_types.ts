import { z } from "zod";

import { flowGraphSchema } from "@/shared/flow_graph.js";
import type { FlowGraph } from "@/shared/flow_graph.js";

const FLOW_NAME_MAX_LENGTH = 80;
const VERSION_NOTE_MAX_LENGTH = 500;

export interface FlowSummary {
    id: string;
    projectId: string;
    name: string;
    isDefault: boolean;
    archived: boolean;
    latestVersion?: number;
    draftUpdatedAt: string;
    draftRevision: number;
}

export interface FlowVersion {
    flowId: string;
    version: number;
    graph: FlowGraph;
    publishedAt: string;
    note?: string;
}

export type FlowVersionSummary = Omit<FlowVersion, "graph">;

export interface FlowDraft {
    flowId: string;
    graph: FlowGraph;
    revision: number;
    updatedAt: string;
}

const flowNameSchema = z.string().trim().min(1).max(FLOW_NAME_MAX_LENGTH);

export const createFlowInput = z.object({
    name: flowNameSchema,
    graph: flowGraphSchema.optional(),
});

export const renameFlowInput = z.object({ name: flowNameSchema });

export const listFlowsQuery = z.object({
    includeArchived: z.stringbool().optional(),
});

export const saveFlowDraftInput = z.object({
    graph: flowGraphSchema,
    expectedRevision: z.number().int().positive(),
});

export const publishFlowInput = z
    .object({ note: z.string().trim().min(1).max(VERSION_NOTE_MAX_LENGTH).optional() })
    .optional();
