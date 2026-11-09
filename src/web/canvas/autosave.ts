import type { CancelTimeout, Clock } from "@/lib/clock.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { ApiError } from "@/web/api/api_client.js";

const HTTP_CONFLICT = 409;

export interface AutosaveOptions {
    delayMs: number;
    /** Resolves with the draft's new revision. */
    save(graph: FlowGraph, revision: number): Promise<number>;
    onConflict(): void;
    onError(error: unknown): void;
    setTimer: Clock["setTimeout"];
}

export interface Autosave {
    schedule(graph: FlowGraph, revision: number): void;
    flush(): Promise<void>;
}

interface PendingChange {
    graph: FlowGraph;
    revision: number;
}

export function createAutosave(options: AutosaveOptions): Autosave {
    let pendingChange: PendingChange | undefined;
    let cancelTimer: CancelTimeout | undefined;
    let savesInOrder: Promise<void> = Promise.resolve();
    let lastSavedRevision = 0;

    function schedule(graph: FlowGraph, revision: number): void {
        pendingChange = { graph, revision };
        cancelTimer?.();
        cancelTimer = options.setTimer(() => void flush(), options.delayMs);
    }

    function flush(): Promise<void> {
        cancelTimer?.();
        cancelTimer = undefined;
        savesInOrder = savesInOrder.then(savePendingChange);

        return savesInOrder;
    }

    async function savePendingChange(): Promise<void> {
        if (!pendingChange) {
            return;
        }

        const { graph, revision } = pendingChange;
        pendingChange = undefined;
        try {
            // A change scheduled while a save was in flight still carries the revision from before it.
            lastSavedRevision = await options.save(graph, Math.max(revision, lastSavedRevision));
        } catch (error) {
            reportFailure(error, options);
        }
    }

    return { schedule, flush };
}

function reportFailure(error: unknown, options: AutosaveOptions): void {
    if (isRevisionConflict(error)) {
        options.onConflict();
        return;
    }

    options.onError(error);
}

function isRevisionConflict(error: unknown): boolean {
    return error instanceof ApiError && error.status === HTTP_CONFLICT;
}
