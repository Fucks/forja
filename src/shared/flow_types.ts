import { z } from "zod";

import { flowGraphSchema } from "@/shared/flow_graph.js";
import type { FlowGraph } from "@/shared/flow_graph.js";

const FLOW_NAME_MAX_LENGTH = 80;
const VERSION_NOTE_MAX_LENGTH = 500;
export const DRAFT_VERSION = "draft";

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

export const flowNameSchema = z.string().trim().min(1).max(FLOW_NAME_MAX_LENGTH);

export const createFlowInput = z.object({
    name: flowNameSchema,
    graph: flowGraphSchema.optional(),
});

export interface FlowTemplateSummary {
    id: string;
    name: string;
    description: string;
}

export const createFlowFromTemplateInput = z.object({
    templateId: z.string().min(1),
    name: flowNameSchema,
});

export const renameFlowInput = z.object({ name: flowNameSchema });

export const listFlowsQuery = z.object({
    includeArchived: z.stringbool().optional(),
});

export const saveFlowDraftInput = z.object({
    graph: flowGraphSchema,
    expectedRevision: z.number().int().positive(),
});

// Fastify hands the body schema `null` when the request has no body, and the note is optional.
export const publishFlowInput = z
    .object({ note: z.string().trim().min(1).max(VERSION_NOTE_MAX_LENGTH).optional() })
    .nullish();

export const exportFlowQuery = z.object({
    version: z.union([z.literal(DRAFT_VERSION), z.coerce.number().int().positive()]),
});
export type ExportedFlowVersion = z.infer<typeof exportFlowQuery>["version"];
