import { nextFireAt } from "@/engine/cron_schedule.js";
import type { CancelTimeout, Clock } from "@/lib/clock.js";
import type { FireInput } from "@/server/triggers/trigger_firing.js";
import type { Trigger } from "@/shared/trigger_types.js";

export const CRON_FIRE_REASON = "cron";

const LATE_FIRE_TOLERANCE_MS = 2 * 60_000;
// Longer delays overflow the platform timer, which then fires right away.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export interface CronRunnerDeps {
    clock: Clock;
    listScheduleTriggers(): Promise<Trigger[]>;
    fire(id: string, input: FireInput): Promise<unknown>;
    log(message: string): void;
}

export interface CronRunner {
    start(): Promise<void>;
    /** Picks up the current state of the trigger: new expression, disabled or removed. */
    reschedule(triggerId: string): Promise<void>;
    stop(): void;
}

interface Schedule {
    cron: string;
    timezone: string;
}

export function createCronRunner(deps: CronRunnerDeps): CronRunner {
    return new CronScheduler(deps);
}

// Only the next fire of each trigger is armed; each fire arms the following one. Fires missed while
// the server was down are logged, never made up.
class CronScheduler implements CronRunner {
    private readonly cancelTimerByTrigger = new Map<string, CancelTimeout>();
    private isRunning = false;

    constructor(private readonly deps: CronRunnerDeps) {}

    async start(): Promise<void> {
        this.isRunning = true;
        const triggers = await this.deps.listScheduleTriggers();

        triggers.forEach((trigger) => {
            this.logMissedFire(trigger);
            this.scheduleNextFire(trigger);
        });
    }

    async reschedule(triggerId: string): Promise<void> {
        const triggers = await this.deps.listScheduleTriggers();
        const trigger = triggers.find((candidate) => candidate.id === triggerId);

        this.cancelTimer(triggerId);
        if (trigger) {
            this.scheduleNextFire(trigger);
        }
    }

    stop(): void {
        this.isRunning = false;
        this.cancelTimerByTrigger.forEach((cancelTimer) => cancelTimer());
        this.cancelTimerByTrigger.clear();
    }

    private scheduleNextFire(trigger: Trigger): void {
        const schedule = findActiveSchedule(trigger);
        if (!this.isRunning || !schedule) {
            return;
        }

        const after = latestOf(this.deps.clock.now(), trigger.lastFiredAt);
        const dueAt = nextFireAt(schedule.cron, schedule.timezone, after);
        this.armTimer(trigger.id, dueAt);
    }

    private armTimer(triggerId: string, dueAt: Date): void {
        this.cancelTimer(triggerId);

        const msUntilDue = dueAt.getTime() - this.deps.clock.now().getTime();
        const delayMs = Math.min(msUntilDue, MAX_TIMER_DELAY_MS);
        const cancelTimer = this.deps.clock.setTimeout(() => {
            this.wakeUp(triggerId, dueAt).catch((error: unknown) => {
                this.deps.log(`Gatilho ${triggerId}: falha ao reagendar: ${describeError(error)}`);
            });
        }, delayMs);
        this.cancelTimerByTrigger.set(triggerId, cancelTimer);
    }

    private async wakeUp(triggerId: string, dueAt: Date): Promise<void> {
        this.cancelTimerByTrigger.delete(triggerId);
        const lateByMs = this.deps.clock.now().getTime() - dueAt.getTime();
        const isSplitDelayStep = lateByMs < 0;
        if (isSplitDelayStep) {
            this.armTimer(triggerId, dueAt);
            return;
        }

        if (lateByMs > LATE_FIRE_TOLERANCE_MS) {
            this.deps.log(`Gatilho ${triggerId}: disparo atrasado de ${dueAt.toISOString()}.`);
        }
        await this.fire(triggerId);
        await this.reschedule(triggerId);
    }

    private async fire(triggerId: string): Promise<void> {
        try {
            await this.deps.fire(triggerId, { reason: CRON_FIRE_REASON });
        } catch (error) {
            this.deps.log(
                `Gatilho ${triggerId}: falha no disparo do cron: ${describeError(error)}`,
            );
        }
    }

    private logMissedFire(trigger: Trigger): void {
        const schedule = findActiveSchedule(trigger);
        if (!schedule) {
            return;
        }

        const lastKnownAt = new Date(trigger.lastFiredAt ?? trigger.createdAt);
        const firstDueAt = nextFireAt(schedule.cron, schedule.timezone, lastKnownAt);
        if (firstDueAt < this.deps.clock.now()) {
            this.deps.log(
                `Gatilho ${trigger.id}: disparo perdido enquanto o servidor estava desligado ` +
                    `(${firstDueAt.toISOString()}); não será recuperado.`,
            );
        }
    }

    private cancelTimer(triggerId: string): void {
        this.cancelTimerByTrigger.get(triggerId)?.();
        this.cancelTimerByTrigger.delete(triggerId);
    }
}

function findActiveSchedule(trigger: Trigger): Schedule | undefined {
    if (!trigger.enabled || trigger.config.kind !== "schedule") {
        return undefined;
    }

    return trigger.config;
}

// A fire recorded ahead of the clock (clock adjusted backwards) must not be repeated.
function latestOf(now: Date, lastFiredAt: string | undefined): Date {
    if (!lastFiredAt) {
        return now;
    }

    const lastFiredDate = new Date(lastFiredAt);
    return lastFiredDate > now ? lastFiredDate : now;
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
