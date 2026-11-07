export interface QueuePosition {
    queuedAtMs: number;
    dagPosition: number;
    workItemId: string | undefined;
}

export function compareQueueOrder(a: QueuePosition, b: QueuePosition): number {
    return (
        a.queuedAtMs - b.queuedAtMs ||
        a.dagPosition - b.dagPosition ||
        compareWorkItemIds(a.workItemId, b.workItemId)
    );
}

function compareWorkItemIds(a: string | undefined, b: string | undefined): number {
    if (a === b) {
        return 0;
    }
    if (a === undefined) {
        return -1;
    }
    if (b === undefined) {
        return 1;
    }

    return a < b ? -1 : 1;
}
