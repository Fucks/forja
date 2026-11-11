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

export const triggerConfigSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("manual") }),
    z.object({ kind: z.literal("schedule"), cron: z.string().min(1), timezone: z.string().min(1) }),
    z.object({
        kind: z.literal("event"),
        event: z.enum(TRIGGER_EVENTS),
        filter: z
            .object({
                flowId: z.string().min(1).optional(),
                status: z.enum(RUN_STATUS_NAMES).optional(),
            })
            .optional(),
    }),
    z.object({ kind: z.literal("webhook"), tokenHash: z.string().min(1) }),
    z.object({ kind: z.literal("board_column"), columnId: z.string().min(1) }),
]);

export type TriggerConfig = z.infer<typeof triggerConfigSchema>;

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
    config: triggerConfigSchema,
});

// Built without defaults: a partial of `createTriggerInput` would reset the fields the request did
// not send.
export const updateTriggerInput = z.object({
    name: triggerNameSchema.optional(),
    enabled: z.boolean().optional(),
    policy: policySchema.optional(),
    itemSelection: itemSelectionSchema.optional(),
    config: triggerConfigSchema.optional(),
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
