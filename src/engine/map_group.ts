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
    // In arrival order, which is the order items start in.
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

// A retried NodeRun runs its finished item again.
export function reopenItem(state: MapGroupState, itemId: string): MapGroupState {
    return withItemStatuses(state, (item) =>
        item.itemId === itemId && FINISHED_ITEM_STATUSES.has(item.status) ? "running" : item.status,
    );
}

// For maps chained by item-correlated edges: an item arrives once it succeeded in every upstream map,
// and the input closes when every upstream map is done. A list-fed map has no upstream maps.
export function receiveItemsFromUpstream(
    state: MapGroupState,
    upstreamStates: MapGroupState[],
): MapGroupState {
    if (upstreamStates.length === 0) {
        return state;
    }

    const knownItemIds = new Set(state.items.map((item) => item.itemId));
    const arrivingItemIds = itemIdsReleasedByEvery(upstreamStates).filter(
        (itemId) => !knownItemIds.has(itemId),
    );
    const shouldCloseInput = !state.inputClosed && upstreamStates.every(isMapDone);
    if (arrivingItemIds.length === 0 && !shouldCloseInput) {
        return state;
    }

    const received = addItems(state, arrivingItemIds);

    return shouldCloseInput ? closeInput(received) : received;
}

export function cancelQueuedItems(state: MapGroupState): MapGroupState {
    return withItemStatuses(state, (item) => (item.status === "queued" ? "canceled" : item.status));
}

export function isMapDone(state: MapGroupState): boolean {
    return (
        state.inputClosed && state.items.every((item) => FINISHED_ITEM_STATUSES.has(item.status))
    );
}

// Waiting for a slot counts as in progress: the item still has work ahead in this map.
export function isItemInProgress(state: MapGroupState, itemId: string): boolean {
    return state.items.some(
        (item) => item.itemId === itemId && !FINISHED_ITEM_STATUSES.has(item.status),
    );
}

// A map that received items and finished none of them successfully: nothing came out of it.
export function hasLostAllItems(state: MapGroupState): boolean {
    return state.items.length > 0 && itemIdsWithStatus(state, "succeeded").length === 0;
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

function itemIdsReleasedByEvery(upstreamStates: MapGroupState[]): string[] {
    const [firstUpstream, ...otherUpstreams] = upstreamStates;
    if (!firstUpstream) {
        return [];
    }

    return releasedItemIds(firstUpstream).filter((itemId) =>
        otherUpstreams.every((upstream) => releasedItemIds(upstream).includes(itemId)),
    );
}

// A barrier map releases its items downstream only when all of them finished.
function releasedItemIds(upstream: MapGroupState): string[] {
    if (upstream.barrier && !isMapDone(upstream)) {
        return [];
    }

    return itemIdsWithStatus(upstream, "succeeded");
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
