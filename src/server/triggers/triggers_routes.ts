import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { describeCron, nextFireAt } from "@/engine/cron_schedule.js";
import { systemClock } from "@/lib/clock.js";
import { resolveWith } from "@/lib/resolve_with.js";
import type { AppDeps } from "@/server/app.js";
import type { RouteModule } from "@/server/route_modules.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { createCronRunner } from "@/server/triggers/cron_runner.js";
import type { CronRunner } from "@/server/triggers/cron_runner.js";
import { createEventTriggerListener } from "@/server/triggers/event_trigger_listener.js";
import { startQueuedFiresWhenRunsFinish } from "@/server/triggers/trigger_firing.js";
import type { TriggerFiringDeps } from "@/server/triggers/trigger_firing.js";
import { TriggerRepository } from "@/server/triggers/trigger_repository.js";
import { createTriggerService } from "@/server/triggers/trigger_service.js";
import type { TriggerService } from "@/server/triggers/trigger_service.js";
import {
    createTriggerInput,
    fireTriggerInput,
    listTriggersQuery,
    MANUAL_FIRE_REASON,
    triggerHistoryQuery,
    triggersPausedInput,
    updateTriggerInput,
} from "@/shared/trigger_types.js";
import type { ListedTrigger, Trigger, TriggersPaused } from "@/shared/trigger_types.js";

const PROJECT_TRIGGERS_PATH = "/projects/:projectId/triggers";
const TRIGGERS_PAUSED_PATH = "/triggers/paused";
const TRIGGER_PATH = "/triggers/:id";
const TRIGGER_FIRE_PATH = `${TRIGGER_PATH}/fire`;
const TRIGGER_HISTORY_PATH = `${TRIGGER_PATH}/history`;
const TRIGGER_ROTATE_TOKEN_PATH = `${TRIGGER_PATH}/rotate-token`;
const MAX_TRIGGER_CHAIN_DEPTH = 3;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const triggerParamsSchema = z.object({ id: z.string().min(1) });

export const registerTriggersRoutes: RouteModule = (app, deps) => {
    const firingDeps = createTriggerFiringDeps(deps);
    const cronRunner = createCronRunner({
        clock: firingDeps.clock,
        listScheduleTriggers: () => resolveWith(() => firingDeps.repo.listByKind("schedule")),
        fire: (id, input) => triggers.fire(id, input),
        log: (message) => app.log.info(message),
    });
    const triggers = createTriggerService({ ...firingDeps, cronRunner });

    registerProjectTriggersRoutes(app, triggers);
    registerPausedRoutes(app, triggers);
    registerTriggerRoutes(app, triggers);
    startQueuedFiresWhileAppIsUp(app, firingDeps);
    startCronRunnerWhileAppIsUp(app, cronRunner);
    startEventTriggersWhileAppIsUp(app, firingDeps.events, triggers);
};

export function createTriggerFiringDeps(deps: AppDeps): TriggerFiringDeps {
    return {
        repo: new TriggerRepository(deps.db),
        executor: deps.executor,
        runs: new SqliteRunRepository(deps.db, systemClock),
        events: deps.events,
        clock: systemClock,
    };
}

function startQueuedFiresWhileAppIsUp(app: FastifyInstance, firingDeps: TriggerFiringDeps): void {
    let stopListening: (() => void) | undefined;

    app.addHook("onReady", (done) => {
        stopListening = startQueuedFiresWhenRunsFinish(firingDeps);
        done();
    });
    app.addHook("onClose", (_closingApp, done) => {
        stopListening?.();
        done();
    });
}

function startCronRunnerWhileAppIsUp(app: FastifyInstance, cronRunner: CronRunner): void {
    app.addHook("onReady", () => cronRunner.start());
    app.addHook("onClose", (_closingApp, done) => {
        cronRunner.stop();
        done();
    });
}

function startEventTriggersWhileAppIsUp(
    app: FastifyInstance,
    events: EventBus,
    triggers: TriggerService,
): void {
    const listener = createEventTriggerListener({
        events,
        triggers,
        maxChainDepth: MAX_TRIGGER_CHAIN_DEPTH,
    });

    app.addHook("onReady", (done) => {
        listener.start();
        done();
    });
    app.addHook("onClose", (_closingApp, done) => {
        listener.stop();
        done();
    });
}

function registerProjectTriggersRoutes(app: FastifyInstance, triggers: TriggerService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(
        PROJECT_TRIGGERS_PATH,
        { schema: { params: projectParamsSchema, querystring: listTriggersQuery } },
        async (request): Promise<ListedTrigger[]> => {
            const projectTriggers = await triggers.list(request.params.projectId, request.query);
            const now = systemClock.now();

            return projectTriggers.map((trigger) => withSchedulePreview(trigger, now));
        },
    );

    typedApp.post(
        PROJECT_TRIGGERS_PATH,
        { schema: { params: projectParamsSchema, body: createTriggerInput } },
        async (request, reply) => {
            const trigger = await triggers.create({
                projectId: request.params.projectId,
                ...request.body,
            });
            return reply.code(HTTP_CREATED).send(trigger);
        },
    );
}

function registerPausedRoutes(app: FastifyInstance, triggers: TriggerService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(TRIGGERS_PAUSED_PATH, async (): Promise<TriggersPaused> => {
        return { paused: await triggers.isAllPaused() };
    });

    typedApp.put(
        TRIGGERS_PAUSED_PATH,
        { schema: { body: triggersPausedInput } },
        async (request): Promise<TriggersPaused> => {
            await triggers.setAllPaused(request.body.paused);
            return { paused: request.body.paused };
        },
    );
}

function registerTriggerRoutes(app: FastifyInstance, triggers: TriggerService): void {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.patch(
        TRIGGER_PATH,
        { schema: { params: triggerParamsSchema, body: updateTriggerInput } },
        (request) => triggers.update(request.params.id, request.body),
    );

    typedApp.delete(
        TRIGGER_PATH,
        { schema: { params: triggerParamsSchema } },
        async (request, reply) => {
            await triggers.remove(request.params.id);
            return reply.code(HTTP_NO_CONTENT).send();
        },
    );

    typedApp.post(
        TRIGGER_FIRE_PATH,
        { schema: { params: triggerParamsSchema, body: fireTriggerInput } },
        async (request, reply) => {
            const fire = await triggers.fire(request.params.id, {
                itemIds: request.body.itemIds,
                reason: MANUAL_FIRE_REASON,
            });
            return reply.code(HTTP_CREATED).send(fire);
        },
    );

    typedApp.post(
        TRIGGER_ROTATE_TOKEN_PATH,
        { schema: { params: triggerParamsSchema } },
        (request) => triggers.rotateWebhookToken(request.params.id),
    );

    typedApp.get(
        TRIGGER_HISTORY_PATH,
        { schema: { params: triggerParamsSchema, querystring: triggerHistoryQuery } },
        (request) => triggers.history(request.params.id, request.query.limit),
    );
}

function withSchedulePreview(trigger: Trigger, now: Date): ListedTrigger {
    if (trigger.config.kind !== "schedule") {
        return trigger;
    }

    const { cron, timezone } = trigger.config;
    const cronDescription = describeCron(cron);
    if (!trigger.enabled) {
        return { ...trigger, cronDescription };
    }

    return {
        ...trigger,
        cronDescription,
        nextFireAt: nextFireAt(cron, timezone, now).toISOString(),
    };
}
