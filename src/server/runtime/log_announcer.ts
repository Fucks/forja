import type { Clock } from "@/lib/clock.js";

export interface AppendedLogRange {
    fromSeq: number;
    toSeq: number;
}

export interface LogAnnouncer {
    announce(nodeRunId: string, seq: number): void;
}

export interface LogAnnouncerDeps {
    clock: Clock;
    publish: (nodeRunId: string, range: AppendedLogRange) => void;
}

// Agents can write hundreds of events per second; one announcement per window spares the SSE stream.
const ANNOUNCE_INTERVAL_MS = 250;

export function createLogAnnouncer({ clock, publish }: LogAnnouncerDeps): LogAnnouncer {
    const pendingRanges = new Map<string, AppendedLogRange>();

    function publishPendingRange(nodeRunId: string): void {
        const range = pendingRanges.get(nodeRunId);
        pendingRanges.delete(nodeRunId);
        if (range) {
            publish(nodeRunId, range);
        }
    }

    return {
        announce(nodeRunId, seq) {
            const pendingRange = pendingRanges.get(nodeRunId);
            if (pendingRange) {
                pendingRanges.set(nodeRunId, { ...pendingRange, toSeq: seq });
                return;
            }

            pendingRanges.set(nodeRunId, { fromSeq: seq, toSeq: seq });
            clock.setTimeout(() => publishPendingRange(nodeRunId), ANNOUNCE_INTERVAL_MS);
        },
    };
}
