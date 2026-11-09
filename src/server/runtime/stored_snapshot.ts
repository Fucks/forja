import { z } from "zod";

import type { SchedulerSnapshot } from "@/engine/scheduler_types.js";
import { NODE_RUN_STATUS_NAMES, RUN_STATUS_NAMES } from "@/shared/events.js";

// Only what restoring relies on is checked; the rest was written by takeSnapshot as it is.
const storedSnapshotSchema = z.looseObject({
    run: z.looseObject({
        id: z.string(),
        status: z.enum(RUN_STATUS_NAMES),
        createdAt: z.iso.datetime(),
    }),
    nodeRuns: z.array(
        z.looseObject({
            id: z.string(),
            runId: z.string(),
            nodeId: z.string(),
            status: z.enum(NODE_RUN_STATUS_NAMES),
            attempt: z.number().int(),
            iteration: z.number().int(),
            groupPath: z.array(z.unknown()),
        }),
    ),
});

export class InvalidRunSnapshotError extends Error {
    constructor(readonly runId: string) {
        super(`The stored snapshot of run ${runId} cannot be restored`);
        this.name = "InvalidRunSnapshotError";
    }
}

export function isSchedulerSnapshotOfRun(
    stored: unknown,
    runId: string,
): stored is SchedulerSnapshot {
    const parsed = storedSnapshotSchema.safeParse(stored);

    return parsed.success && parsed.data.run.id === runId;
}
