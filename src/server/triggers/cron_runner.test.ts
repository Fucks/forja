import type { CancelTimeout, Clock } from "@/lib/clock.js";
import { createCronRunner } from "@/server/triggers/cron_runner.js";
import type { CronRunner } from "@/server/triggers/cron_runner.js";
import type { Trigger, TriggerConfig } from "@/shared/trigger_types.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const NOW = new Date("2026-11-11T12:00:00Z");
const NIGHTLY_IN_SAO_PAULO_UTC = new Date("2026-11-12T01:00:00Z");
const NOON_IN_SAO_PAULO_UTC = new Date("2026-11-11T15:00:00Z");
const NIGHTLY_CONFIG: TriggerConfig = {
    kind: "schedule",
    cron: "0 22 * * *",
    timezone: "America/Sao_Paulo",
};

// Simulates a suspended computer: the wall clock moves on while the pending timers stay put.
class SuspendableClock implements Clock {
    private suspendedMs = 0;

    constructor(readonly timers: FakeClock) {}

    now(): Date {
        return new Date(this.timers.now().getTime() + this.suspendedMs);
    }

    setTimeout(fn: () => void, ms: number): CancelTimeout {
        return this.timers.setTimeout(fn, ms);
    }

    suspendFor(ms: number): void {
        this.suspendedMs += ms;
    }
}

describe("createCronRunner", () => {
    let clock: SuspendableClock;
    let triggers: Trigger[];
    let fires: { triggerId: string; reason: string; at: Date }[];
    let logs: string[];
    let isFireFailing: boolean;
    let runner: CronRunner;

    beforeEach(() => {
        clock = new SuspendableClock(new FakeClock(NOW));
        triggers = [];
        fires = [];
        logs = [];
        isFireFailing = false;
        runner = buildRunner();
    });

    afterEach(() => {
        runner.stop();
    });

    function buildRunner(): CronRunner {
        return createCronRunner({
            clock,
            listScheduleTriggers: () =>
                Promise.resolve(triggers.map((trigger) => ({ ...trigger }))),
            fire: (triggerId, input) => {
                if (isFireFailing) {
                    return Promise.reject(new Error("banco indisponível"));
                }
                fires.push({ triggerId, reason: input.reason, at: clock.now() });
                editTrigger(triggerId, { lastFiredAt: clock.now().toISOString() });
                return Promise.resolve();
            },
            log: (message) => logs.push(message),
        });
    }

    function addTrigger(overrides: Partial<Trigger> = {}): Trigger {
        const trigger: Trigger = {
            id: `trg_${triggers.length + 1}`,
            projectId: "prj_forja",
            flowId: "flw_entrega",
            name: "Noturno",
            enabled: true,
            policy: "skip",
            itemSelection: "source",
            config: NIGHTLY_CONFIG,
            createdAt: NOW.toISOString(),
            ...overrides,
        };
        triggers.push(trigger);
        return trigger;
    }

    function editTrigger(id: string, patch: Partial<Trigger>): void {
        triggers = triggers.map((trigger) =>
            trigger.id === id ? { ...trigger, ...patch } : trigger,
        );
    }

    async function advanceTo(date: Date): Promise<void> {
        clock.timers.set(date);
        await settle();
    }

    async function advanceBy(ms: number): Promise<void> {
        clock.timers.advance(ms);
        await settle();
    }

    function firedAt(): string[] {
        return fires.map((fire) => fire.at.toISOString());
    }

    describe("start", () => {
        it("fires a schedule trigger at its next time with the cron reason", async () => {
            const trigger = addTrigger();
            await runner.start();

            await advanceTo(NIGHTLY_IN_SAO_PAULO_UTC);

            expect(fires).toEqual([
                { triggerId: trigger.id, reason: "cron", at: NIGHTLY_IN_SAO_PAULO_UTC },
            ]);
        });

        it("does not fire before the time", async () => {
            addTrigger();
            await runner.start();

            await advanceTo(new Date(NIGHTLY_IN_SAO_PAULO_UTC.getTime() - 1));

            expect(fires).toEqual([]);
        });

        it("schedules the following fire after each fire", async () => {
            addTrigger();
            await runner.start();

            await advanceTo(NIGHTLY_IN_SAO_PAULO_UTC);
            await advanceBy(DAY_MS);

            expect(firedAt()).toEqual(["2026-11-12T01:00:00.000Z", "2026-11-13T01:00:00.000Z"]);
        });

        it("does not schedule a disabled trigger", async () => {
            addTrigger({ enabled: false });
            await runner.start();

            await advanceBy(DAY_MS);

            expect(fires).toEqual([]);
        });

        it("fires a trigger due further away than the longest platform timer exactly once", async () => {
            addTrigger({ config: { ...NIGHTLY_CONFIG, cron: "0 0 1 2 *" } });
            await runner.start();

            await advanceTo(new Date("2027-02-01T02:59:59Z"));
            const firesBeforeDue = fires.length;
            await advanceBy(HOUR_MS);

            expect(firesBeforeDue).toBe(0);
            expect(firedAt()).toEqual(["2027-02-01T03:00:00.000Z"]);
        });

        it("keeps scheduling when a fire fails, and logs the failure", async () => {
            addTrigger();
            await runner.start();
            isFireFailing = true;

            await advanceTo(NIGHTLY_IN_SAO_PAULO_UTC);
            isFireFailing = false;
            await advanceBy(DAY_MS);

            expect(firedAt()).toEqual(["2026-11-13T01:00:00.000Z"]);
            expect(logs).toEqual([expect.stringContaining("banco indisponível")]);
        });
    });

    describe("reschedule", () => {
        it("moves the timer to the new time when the expression changes", async () => {
            const trigger = addTrigger();
            await runner.start();

            editTrigger(trigger.id, { config: { ...NIGHTLY_CONFIG, cron: "0 12 * * *" } });
            await runner.reschedule(trigger.id);
            await advanceTo(NIGHTLY_IN_SAO_PAULO_UTC);

            expect(firedAt()).toEqual([NOON_IN_SAO_PAULO_UTC.toISOString()]);
        });

        it("cancels the timer when the trigger is disabled", async () => {
            const trigger = addTrigger();
            await runner.start();

            editTrigger(trigger.id, { enabled: false });
            await runner.reschedule(trigger.id);
            await advanceBy(DAY_MS);

            expect(fires).toEqual([]);
        });

        it("cancels the timer when the trigger is removed", async () => {
            const trigger = addTrigger();
            await runner.start();

            triggers = [];
            await runner.reschedule(trigger.id);
            await advanceBy(DAY_MS);

            expect(fires).toEqual([]);
        });

        it("schedules a trigger created after the start", async () => {
            await runner.start();

            const trigger = addTrigger();
            await runner.reschedule(trigger.id);
            await advanceTo(NIGHTLY_IN_SAO_PAULO_UTC);

            expect(fires.map((fire) => fire.triggerId)).toEqual([trigger.id]);
        });

        it("keeps a single timer when reschedules run at the same time", async () => {
            const trigger = addTrigger();
            await runner.start();

            await Promise.all([runner.reschedule(trigger.id), runner.reschedule(trigger.id)]);
            await advanceTo(NIGHTLY_IN_SAO_PAULO_UTC);

            expect(fires).toHaveLength(1);
        });
    });

    describe("stop", () => {
        it("cancels every timer and ignores later reschedules", async () => {
            const trigger = addTrigger();
            await runner.start();

            runner.stop();
            await runner.reschedule(trigger.id);
            await advanceBy(DAY_MS);

            expect(fires).toEqual([]);
        });
    });

    describe("late timers", () => {
        it("fires once and logs a late fire when the timer wakes more than 2 minutes late", async () => {
            addTrigger();
            await runner.start();

            clock.suspendFor(3 * DAY_MS);
            await advanceTo(NIGHTLY_IN_SAO_PAULO_UTC);

            expect(fires).toHaveLength(1);
            expect(logs).toEqual([expect.stringContaining("disparo atrasado")]);
        });

        it("fires without a late log when the timer wakes within 2 minutes", async () => {
            addTrigger();
            await runner.start();

            clock.suspendFor(MINUTE_MS);
            await advanceTo(NIGHTLY_IN_SAO_PAULO_UTC);

            expect(fires).toHaveLength(1);
            expect(logs).toEqual([]);
        });

        it("schedules the next fire after the late one, without making up the others", async () => {
            addTrigger();
            await runner.start();

            clock.suspendFor(3 * DAY_MS);
            await advanceTo(NIGHTLY_IN_SAO_PAULO_UTC);
            await advanceBy(DAY_MS);

            expect(firedAt()).toEqual(["2026-11-15T01:00:00.000Z", "2026-11-16T01:00:00.000Z"]);
        });
    });

    describe("restart", () => {
        it("does not fire again a fire already recorded, even when the clock is behind it", async () => {
            addTrigger({ lastFiredAt: NIGHTLY_IN_SAO_PAULO_UTC.toISOString() });
            clock.timers.set(new Date(NIGHTLY_IN_SAO_PAULO_UTC.getTime() - MINUTE_MS));

            await runner.start();
            await advanceBy(HOUR_MS);

            expect(fires).toEqual([]);
        });

        it("logs the fires missed while the server was down without making them up", async () => {
            addTrigger({ createdAt: "2026-11-01T00:00:00Z", lastFiredAt: "2026-11-09T01:00:00Z" });

            await runner.start();
            await advanceBy(HOUR_MS);

            expect(fires).toEqual([]);
            expect(logs).toEqual([
                expect.stringContaining("perdido enquanto o servidor estava desligado"),
            ]);
        });

        it("counts the missed fires from the creation when the trigger never fired", async () => {
            addTrigger({ createdAt: "2026-11-10T12:00:00Z" });

            await runner.start();

            expect(logs).toEqual([expect.stringContaining("perdido")]);
        });
    });
});

function settle(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}
