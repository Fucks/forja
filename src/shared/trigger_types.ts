import { z } from "zod";

import { RUN_STATUS_NAMES } from "@/shared/events.js";

const TRIGGER_NAME_MAX_LENGTH = 80;
const MAX_ITEMS_PER_FIRE = 100;
const DEFAULT_HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGE_SIZE = 200;

export const TRIGGER_KINDS = ["manual", "schedule", "event", "webhook", "board_column"] as const;
export const TRIGGER_POLICIES = ["skip", "queue", "parallel"] as const;
export const ITEM_SELECTIONS = ["source", "event_items"] as const;
export const TRIGGER_EVENTS = ["usage.limit_reset", "run.finished", "work_item.created"] as const;
export const TRIGGER_FIRE_OUTCOMES = ["started", "skipped", "queued", "error"] as const;

export const MANUAL_FIRE_REASON = "manual";

export type TriggerKind = (typeof TRIGGER_KINDS)[number];
export type TriggerPolicy = (typeof TRIGGER_POLICIES)[number];
export type ItemSelection = (typeof ITEM_SELECTIONS)[number];
export type TriggerFireOutcome = (typeof TRIGGER_FIRE_OUTCOMES)[number];

const manualConfigSchema = z.object({ kind: z.literal("manual") });
const scheduleConfigSchema = z.object({
    kind: z.literal("schedule"),
    cron: z.string().min(1),
    timezone: z.string().min(1),
});
const eventConfigSchema = z.object({
    kind: z.literal("event"),
    event: z.enum(TRIGGER_EVENTS),
    filter: z
        .object({
            flowId: z.string().min(1).optional(),
            status: z.enum(RUN_STATUS_NAMES).optional(),
        })
        .optional(),
});
const webhookConfigSchema = z.object({ kind: z.literal("webhook"), tokenHash: z.string().min(1) });
const boardColumnConfigSchema = z.object({
    kind: z.literal("board_column"),
    columnId: z.string().min(1),
});

export const triggerConfigSchema = z.discriminatedUnion("kind", [
    manualConfigSchema,
    scheduleConfigSchema,
    eventConfigSchema,
    webhookConfigSchema,
    boardColumnConfigSchema,
]);

// The server makes the token of a webhook, so a request never sends its hash.
export const triggerConfigInputSchema = z.discriminatedUnion("kind", [
    manualConfigSchema,
    scheduleConfigSchema,
    eventConfigSchema,
    webhookConfigSchema.omit({ tokenHash: true }),
    boardColumnConfigSchema,
]);

export type TriggerConfig = z.infer<typeof triggerConfigSchema>;
export type TriggerConfigInput = z.infer<typeof triggerConfigInputSchema>;

export interface Trigger {
    id: string;
    projectId: string;
    flowId: string;
    name: string;
    enabled: boolean;
    policy: TriggerPolicy;
    itemSelection: ItemSelection;
    config: TriggerConfig;
    createdAt: string;
    lastFiredAt?: string;
}

// Schedule triggers add the readable cron, and the next fire while they are enabled.
export interface ListedTrigger extends Trigger {
    cronDescription?: string;
    nextFireAt?: string;
}

// The token of a webhook is shown only once, when the trigger is created or its token rotated.
export interface TriggerWithToken extends Trigger {
    token: string;
}

export interface TriggerFire {
    id: string;
    triggerId: string;
    at: string;
    outcome: TriggerFireOutcome;
    runId?: string;
    message?: string;
}

const triggerNameSchema = z.string().trim().min(1).max(TRIGGER_NAME_MAX_LENGTH);
const policySchema = z.enum(TRIGGER_POLICIES);
const itemSelectionSchema = z.enum(ITEM_SELECTIONS);

export const createTriggerInput = z.object({
    flowId: z.string().min(1),
    name: triggerNameSchema,
    enabled: z.boolean().default(true),
    policy: policySchema.default("skip"),
    itemSelection: itemSelectionSchema.default("source"),
    config: triggerConfigInputSchema,
});

// Built without defaults: a partial of `createTriggerInput` would reset the fields the request did
// not send.
export const updateTriggerInput = z.object({
    name: triggerNameSchema.optional(),
    enabled: z.boolean().optional(),
    policy: policySchema.optional(),
    itemSelection: itemSelectionSchema.optional(),
    config: triggerConfigInputSchema.optional(),
});

export const listTriggersQuery = z.object({ kind: z.enum(TRIGGER_KINDS).optional() });

export const fireTriggerInput = z.object({
    itemIds: z.array(z.string().min(1)).max(MAX_ITEMS_PER_FIRE).optional(),
});

export const triggerHistoryQuery = z.object({
    limit: z.coerce
        .number()
        .int()
        .positive()
        .max(MAX_HISTORY_PAGE_SIZE)
        .default(DEFAULT_HISTORY_PAGE_SIZE),
});

export const triggersPausedInput = z.object({ paused: z.boolean() });

export type TriggersPaused = z.infer<typeof triggersPausedInput>;
