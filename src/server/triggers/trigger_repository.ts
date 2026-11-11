import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { ForjaDb } from "@/server/db/client.js";
import { flows } from "@/server/db/schema/flows.js";
import { appMeta } from "@/server/db/schema/meta.js";
import { projects } from "@/server/db/schema/projects.js";
import { triggerFires, triggers } from "@/server/db/schema/triggers.js";
import type { TriggerFireRow, TriggerRow } from "@/server/db/schema/triggers.js";
import {
    ITEM_SELECTIONS,
    TRIGGER_FIRE_OUTCOMES,
    TRIGGER_POLICIES,
    triggerConfigSchema,
} from "@/shared/trigger_types.js";
import type { Trigger, TriggerFire, TriggerKind } from "@/shared/trigger_types.js";

const ALL_PAUSED_KEY = "triggers.paused";
const PAUSED_VALUE = "true";
const RUNNING_VALUE = "false";

const policySchema = z.enum(TRIGGER_POLICIES);
const itemSelectionSchema = z.enum(ITEM_SELECTIONS);
const outcomeSchema = z.enum(TRIGGER_FIRE_OUTCOMES);
const itemIdsSchema = z.array(z.string());

// What a fire needs to start a run, kept so a queued fire can start later.
export interface FireRequest {
    reason: string;
    itemIds: string[];
}

export interface QueuedFire {
    fire: TriggerFire;
    request: FireRequest;
}

export class TriggerRepository {
    constructor(private readonly db: ForjaDb) {}

    projectExists(projectId: string): boolean {
        const row = this.db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.id, projectId))
            .get();
        return row !== undefined;
    }

    flowBelongsToProject(flowId: string, projectId: string): boolean {
        const row = this.db
            .select({ id: flows.id })
            .from(flows)
            .where(and(eq(flows.id, flowId), eq(flows.projectId, projectId)))
            .get();
        return row !== undefined;
    }

    insert(trigger: Trigger): void {
        this.db.insert(triggers).values(toTriggerRow(trigger)).run();
    }

    update(trigger: Trigger): void {
        this.db
            .update(triggers)
            .set(toTriggerRow(trigger))
            .where(eq(triggers.id, trigger.id))
            .run();
    }

    setLastFiredAt(id: string, lastFiredAt: string): void {
        this.db.update(triggers).set({ lastFiredAt }).where(eq(triggers.id, id)).run();
    }

    delete(id: string): void {
        this.db.delete(triggers).where(eq(triggers.id, id)).run();
    }

    findById(id: string): Trigger | undefined {
        const row = this.db.select().from(triggers).where(eq(triggers.id, id)).get();
        return row && toTrigger(row);
    }

    listByProject(projectId: string, kind?: TriggerKind): Trigger[] {
        const ofProject = eq(triggers.projectId, projectId);
        const condition = kind === undefined ? ofProject : and(ofProject, eq(triggers.kind, kind));

        return this.db
            .select()
            .from(triggers)
            .where(condition)
            .orderBy(asc(triggers.createdAt), asc(triggers.id))
            .all()
            .map(toTrigger);
    }

    listByKind(kind: TriggerKind): Trigger[] {
        return this.db
            .select()
            .from(triggers)
            .where(eq(triggers.kind, kind))
            .orderBy(asc(triggers.createdAt), asc(triggers.id))
            .all()
            .map(toTrigger);
    }

    insertFire(fire: TriggerFire, request: FireRequest): void {
        this.db.insert(triggerFires).values(toTriggerFireRow(fire, request)).run();
    }

    updateFireOutcome(fire: TriggerFire): void {
        this.db
            .update(triggerFires)
            .set({
                outcome: fire.outcome,
                runId: fire.runId ?? null,
                message: fire.message ?? null,
            })
            .where(eq(triggerFires.id, fire.id))
            .run();
    }

    listFiresNewestFirst(triggerId: string, limit: number): TriggerFire[] {
        return this.db
            .select()
            .from(triggerFires)
            .where(eq(triggerFires.triggerId, triggerId))
            .orderBy(desc(triggerFires.at), desc(triggerFires.id))
            .limit(limit)
            .all()
            .map(toTriggerFire);
    }

    findOldestQueuedFireOfFlow(flowId: string): QueuedFire | undefined {
        const row = this.db
            .select({ fire: triggerFires })
            .from(triggerFires)
            .innerJoin(triggers, eq(triggerFires.triggerId, triggers.id))
            .where(and(eq(triggers.flowId, flowId), eq(triggerFires.outcome, "queued")))
            .orderBy(asc(triggerFires.at), asc(triggerFires.id))
            .get();
        return row && { fire: toTriggerFire(row.fire), request: toFireRequest(row.fire) };
    }

    listFlowIdsWithQueuedFires(): string[] {
        return this.db
            .selectDistinct({ flowId: triggers.flowId })
            .from(triggerFires)
            .innerJoin(triggers, eq(triggerFires.triggerId, triggers.id))
            .where(eq(triggerFires.outcome, "queued"))
            .all()
            .map((row) => row.flowId);
    }

    isAllPaused(): boolean {
        const row = this.db
            .select({ value: appMeta.value })
            .from(appMeta)
            .where(eq(appMeta.key, ALL_PAUSED_KEY))
            .get();
        return row?.value === PAUSED_VALUE;
    }

    setAllPaused(paused: boolean): void {
        const value = paused ? PAUSED_VALUE : RUNNING_VALUE;
        this.db
            .insert(appMeta)
            .values({ key: ALL_PAUSED_KEY, value })
            .onConflictDoUpdate({ target: appMeta.key, set: { value } })
            .run();
    }
}

function toTriggerRow(trigger: Trigger): TriggerRow {
    return {
        id: trigger.id,
        projectId: trigger.projectId,
        flowId: trigger.flowId,
        name: trigger.name,
        enabled: trigger.enabled,
        policy: trigger.policy,
        itemSelection: trigger.itemSelection,
        kind: trigger.config.kind,
        configJson: JSON.stringify(trigger.config),
        createdAt: trigger.createdAt,
        lastFiredAt: trigger.lastFiredAt ?? null,
    };
}

function toTrigger(row: TriggerRow): Trigger {
    return {
        id: row.id,
        projectId: row.projectId,
        flowId: row.flowId,
        name: row.name,
        enabled: row.enabled,
        policy: policySchema.parse(row.policy),
        itemSelection: itemSelectionSchema.parse(row.itemSelection),
        config: triggerConfigSchema.parse(JSON.parse(row.configJson)),
        createdAt: row.createdAt,
        lastFiredAt: row.lastFiredAt ?? undefined,
    };
}

function toTriggerFireRow(fire: TriggerFire, request: FireRequest): TriggerFireRow {
    return {
        id: fire.id,
        triggerId: fire.triggerId,
        at: fire.at,
        outcome: fire.outcome,
        runId: fire.runId ?? null,
        message: fire.message ?? null,
        reason: request.reason,
        itemIdsJson: JSON.stringify(request.itemIds),
    };
}

function toTriggerFire(row: TriggerFireRow): TriggerFire {
    return {
        id: row.id,
        triggerId: row.triggerId,
        at: row.at,
        outcome: outcomeSchema.parse(row.outcome),
        runId: row.runId ?? undefined,
        message: row.message ?? undefined,
    };
}

function toFireRequest(row: TriggerFireRow): FireRequest {
    return { reason: row.reason, itemIds: itemIdsSchema.parse(JSON.parse(row.itemIdsJson)) };
}
