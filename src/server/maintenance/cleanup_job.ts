import { nextFireAt } from "@/engine/cron_schedule.js";
import type { CancelTimeout, Clock } from "@/lib/clock.js";
import { describeError } from "@/lib/describe_error.js";
import { formatCount, formatMegabytes } from "@/lib/format.js";
import type { CleanupReport } from "@/server/maintenance/cleanup_service.js";

export interface CleanupJobDeps {
    clock: Clock;
    /** The daily cleanup runs at 03:00 in this timezone. */
    timezone: string;
    cleanup(): Promise<CleanupReport>;
    log(message: string): void;
}

export interface CleanupJob {
    start(): void;
    stop(): void;
    /** Joins the cleanup in progress, if there is one. */
    runNow(): Promise<CleanupReport>;
}

const DAILY_CLEANUP_CRON = "0 3 * * *";

export function createCleanupJob(deps: CleanupJobDeps): CleanupJob {
    return new DailyCleanupJob(deps);
}

class DailyCleanupJob implements CleanupJob {
    private cancelTimer: CancelTimeout | undefined;
    private cleanupInProgress: Promise<CleanupReport> | undefined;
    private isStarted = false;

    constructor(private readonly deps: CleanupJobDeps) {}

    start(): void {
        this.isStarted = true;
        this.scheduleNextCleanup();
    }

    stop(): void {
        this.isStarted = false;
        this.cancelTimer?.();
        this.cancelTimer = undefined;
    }

    runNow(): Promise<CleanupReport> {
        this.cleanupInProgress ??= this.cleanUpAndLog().finally(() => {
            this.cleanupInProgress = undefined;
        });

        return this.cleanupInProgress;
    }

    private scheduleNextCleanup(): void {
        if (!this.isStarted) {
            return;
        }

        const now = this.deps.clock.now();
        const dueAt = nextFireAt(DAILY_CLEANUP_CRON, this.deps.timezone, now);
        this.cancelTimer = this.deps.clock.setTimeout(
            () => void this.runScheduledCleanup(),
            dueAt.getTime() - now.getTime(),
        );
    }

    private async runScheduledCleanup(): Promise<void> {
        try {
            await this.runNow();
        } catch (error) {
            this.deps.log(`[forja] limpeza falhou: ${describeError(error)}`);
        }
        this.scheduleNextCleanup();
    }

    private async cleanUpAndLog(): Promise<CleanupReport> {
        const report = await this.deps.cleanup();
        this.deps.log(describeCleanup(report));

        return report;
    }
}

function describeCleanup(report: CleanupReport): string {
    const runs = formatCount(report.deletedRuns, { one: "run", other: "runs" });
    const freed = formatMegabytes(report.freedBytes);
    const worktrees = formatCount(report.prunedWorktrees, {
        one: "worktree órfão removido",
        other: "worktrees órfãos removidos",
    });

    return `[forja] limpeza: logs de ${runs} removidos (${freed} liberados), ${worktrees}`;
}
