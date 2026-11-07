import type { MapGroup } from "@/engine/graph_queries.js";

export type MapItemStatus = "waiting" | "queued" | "running" | "succeeded" | "failed" | "canceled";

export type MapItemResult = "succeeded" | "failed";

export interface MapGroupItem {
    itemId: string;
    status: MapItemStatus;
}

export interface MapGroupState {
    groupId: string;
    concurrency: number;
    barrier: boolean;
    failFast: boolean;
    // In arrival order, which is also the order of the map's output list.
    items: MapGroupItem[];
    // True when no more items will arrive: the list was received, or the upstream map is done.
    inputClosed: boolean;
}

export interface MapProgress {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
}

const FINISHED_ITEM_STATUSES: ReadonlySet<MapItemStatus> = new Set<MapItemStatus>([
    "succeeded",
    "failed",
    "canceled",
]);

export function createMapGroupState(group: MapGroup): MapGroupState {
    return {
        groupId: group.id,
        concurrency: group.config.concurrency,
        barrier: group.config.barrier,
        failFast: group.config.failFast,
        items: [],
        inputClosed: false,
    };
}

export function addItems(state: MapGroupState, itemIds: string[]): MapGroupState {
    const knownItemIds = new Set(state.items.map((item) => item.itemId));
    const arrivingItems = [...new Set(itemIds)]
        .filter((itemId) => !knownItemIds.has(itemId))
        .map((itemId): MapGroupItem => ({ itemId, status: "queued" }));

    return { ...state, items: [...state.items, ...arrivingItems] };
}

export function closeInput(state: MapGroupState): MapGroupState {
    return { ...state, inputClosed: true };
}

export function itemsToStart(state: MapGroupState): string[] {
    const freeSlotCount = state.concurrency - itemIdsWithStatus(state, "running").length;
    if (freeSlotCount <= 0) {
        return [];
    }

    return itemIdsWithStatus(state, "queued").slice(0, freeSlotCount);
}

export function startItems(state: MapGroupState, itemIds: string[]): MapGroupState {
    const startingItemIds = new Set(itemIds);

    return withItemStatuses(state, (item) =>
        item.status === "queued" && startingItemIds.has(item.itemId) ? "running" : item.status,
    );
}

export function onItemFinished(
    state: MapGroupState,
    itemId: string,
    result: MapItemResult,
): MapGroupState {
    const finished = withItemStatuses(state, (item) =>
        item.itemId === itemId ? result : item.status,
    );
    if (result === "failed" && state.failFast) {
        return cancelQueuedItems(finished);
    }

    return finished;
}

export function isMapDone(state: MapGroupState): boolean {
    return (
        state.inputClosed && state.items.every((item) => FINISHED_ITEM_STATUSES.has(item.status))
    );
}

export function mapProgress(state: MapGroupState): MapProgress {
    return {
        queued: itemIdsWithStatus(state, "queued").length,
        running: itemIdsWithStatus(state, "running").length,
        succeeded: itemIdsWithStatus(state, "succeeded").length,
        failed: itemIdsWithStatus(state, "failed").length,
    };
}

export function itemIdsWithStatus(state: MapGroupState, status: MapItemStatus): string[] {
    return state.items.filter((item) => item.status === status).map((item) => item.itemId);
}

function cancelQueuedItems(state: MapGroupState): MapGroupState {
    return withItemStatuses(state, (item) => (item.status === "queued" ? "canceled" : item.status));
}

function withItemStatuses(
    state: MapGroupState,
    nextStatusOf: (item: MapGroupItem) => MapItemStatus,
): MapGroupState {
    return {
        ...state,
        items: state.items.map((item) => ({ ...item, status: nextStatusOf(item) })),
    };
}
