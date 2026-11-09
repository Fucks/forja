import type { CancelTimeout, Clock } from "@/lib/clock.js";
import type { SyncResult } from "@/server/work_items/github_sync.js";

export interface SyncSchedulerDeps {
    clock: Clock;
    intervalMs: number;
    listProjectIds(): Promise<string[]>;
    /** Reports failures in `SyncResult.error` instead of rejecting. */
    sync(id: string): Promise<SyncResult>;
}

export interface SyncScheduler {
    start(): void;
    stop(): void;
}

export function createSyncScheduler(deps: SyncSchedulerDeps): SyncScheduler {
    let isRunning = false;
    let cancelNextRound: CancelTimeout | undefined;

    function scheduleNextRound(): void {
        if (!isRunning) {
            return;
        }
        cancelNextRound = deps.clock.setTimeout(() => void syncAllProjects(), deps.intervalMs);
    }

    // The next round is armed only when this one ends, so a slow `gh` never overlaps two rounds.
    async function syncAllProjects(): Promise<void> {
        try {
            for (const projectId of await deps.listProjectIds()) {
                await deps.sync(projectId);
            }
        } finally {
            scheduleNextRound();
        }
    }

    return {
        start() {
            if (isRunning) {
                return;
            }
            isRunning = true;
            scheduleNextRound();
        },
        stop() {
            isRunning = false;
            cancelNextRound?.();
            cancelNextRound = undefined;
        },
    };
}
