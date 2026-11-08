import { z } from "zod";

const TITLE_MAX_LENGTH = 200;
const BODY_MAX_LENGTH = 50_000;

export const WORK_ITEM_SOURCES = ["github", "local"] as const;
export const WORK_ITEM_STATES = ["open", "closed"] as const;
export const MANUAL_COLUMNS = ["backlog", "needs_human", "done"] as const;

export type WorkItemSource = (typeof WORK_ITEM_SOURCES)[number];
export type WorkItemState = (typeof WORK_ITEM_STATES)[number];
export type ManualColumn = (typeof MANUAL_COLUMNS)[number];

export interface WorkItem {
    id: string;
    projectId: string;
    source: WorkItemSource;
    number?: number;
    url?: string;
    title: string;
    body: string;
    labels: string[];
    state: WorkItemState;
    blockedBy: string[];
    branch: string;
    manualColumn?: ManualColumn;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
    syncedAt?: string;
}

export interface WorkItemSnapshot {
    id: string;
    title: string;
    body: string;
    number?: number;
    url?: string;
    labels: string[];
    branch: string;
}

export interface GithubIssueData {
    number: number;
    title: string;
    body: string;
    url: string;
    labels: string[];
    state: WorkItemState;
    blockedByNumbers: number[];
}

const titleSchema = z.string().trim().min(1).max(TITLE_MAX_LENGTH);
const bodySchema = z.string().max(BODY_MAX_LENGTH);
const labelsSchema = z.array(z.string());
const blockedBySchema = z.array(z.string());

export const localItemInput = z.object({
    title: titleSchema,
    body: bodySchema.default(""),
    labels: labelsSchema.default([]),
    blockedBy: blockedBySchema.default([]),
});

export type LocalItemInput = z.infer<typeof localItemInput>;

// Built without defaults: a partial of `localItemInput` would fill in an empty body and empty lists
// and wipe the fields the request did not send.
export const updateLocalItemInput = z.object({
    title: titleSchema.optional(),
    body: bodySchema.optional(),
    labels: labelsSchema.optional(),
    blockedBy: blockedBySchema.optional(),
    state: z.enum(WORK_ITEM_STATES).optional(),
});

export type UpdateLocalItemInput = z.infer<typeof updateLocalItemInput>;

export const setManualColumnInput = z.object({ column: z.enum(MANUAL_COLUMNS).nullable() });

export const listWorkItemsQuery = z.object({
    state: z.enum(WORK_ITEM_STATES).optional(),
    label: z.string().min(1).optional(),
    includeArchived: z.stringbool().optional(),
});

export type ListWorkItemsOptions = z.infer<typeof listWorkItemsQuery>;
