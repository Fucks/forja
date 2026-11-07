import type { CancelTimeout, Clock } from "@/lib/clock.js";

const DEFAULT_START = new Date("2026-01-01T00:00:00Z");

interface PendingTimer {
    dueAtMs: number;
    fire: () => void;
}

export class FakeClock implements Clock {
    private currentMs: number;
    private pendingTimers: PendingTimer[] = [];

    constructor(start: Date = DEFAULT_START) {
        this.currentMs = start.getTime();
    }

    now(): Date {
        return new Date(this.currentMs);
    }

    setTimeout(fn: () => void, ms: number): CancelTimeout {
        // Like the real setTimeout, a negative delay means "as soon as possible".
        const timer: PendingTimer = { dueAtMs: this.currentMs + Math.max(0, ms), fire: fn };
        this.schedule(timer);

        return () => this.cancel(timer);
    }

    advance(ms: number): void {
        if (ms < 0) {
            throw new RangeError(`Cannot advance the clock by a negative amount: ${ms} ms`);
        }

        this.moveTo(this.currentMs + ms);
    }

    set(date: Date): void {
        this.moveTo(date.getTime());
    }

    private schedule(timer: PendingTimer): void {
        const timersInDueOrder = [...this.pendingTimers, timer].sort(
            (a, b) => a.dueAtMs - b.dueAtMs,
        );
        this.pendingTimers = timersInDueOrder;
    }

    private cancel(timer: PendingTimer): void {
        this.pendingTimers = this.pendingTimers.filter((pending) => pending !== timer);
    }

    private moveTo(targetMs: number): void {
        let timer = this.takeNextTimerDueBy(targetMs);
        while (timer) {
            this.currentMs = timer.dueAtMs;
            timer.fire();
            timer = this.takeNextTimerDueBy(targetMs);
        }

        this.currentMs = targetMs;
    }

    private takeNextTimerDueBy(targetMs: number): PendingTimer | undefined {
        const [nextTimer, ...laterTimers] = this.pendingTimers;
        if (!nextTimer || nextTimer.dueAtMs > targetMs) {
            return undefined;
        }

        this.pendingTimers = laterTimers;
        return nextTimer;
    }
}
