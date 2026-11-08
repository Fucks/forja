import type { MapGroup } from "@/engine/graph_queries.js";
import {
    addItems,
    cancelQueuedItems,
    closeInput,
    createMapGroupState,
    isMapDone,
    itemIdsWithStatus,
    itemsToStart,
    type MapGroupState,
    mapProgress,
    onItemFinished,
    receiveItemsFromUpstream,
    reopenItem,
    startItems,
} from "@/engine/map_group.js";
import type { MapConfig } from "@/shared/flow_graph.js";

function buildMapGroup(config: Partial<MapConfig> = {}): MapGroup {
    return {
        id: "develop",
        kind: "map",
        label: "Desenvolver",
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 },
        config: { concurrency: 3, barrier: false, failFast: false, ...config },
    };
}

function mapWithItems(itemIds: string[], config: Partial<MapConfig> = {}): MapGroupState {
    return closeInput(addItems(createMapGroupState(buildMapGroup(config)), itemIds));
}

function startAdmittedItems(state: MapGroupState): MapGroupState {
    return startItems(state, itemsToStart(state));
}

describe("createMapGroupState", () => {
    it("copies the group config and starts with no items and an open input", () => {
        const state = createMapGroupState(buildMapGroup({ concurrency: 2, barrier: true }));

        expect(state).toEqual({
            groupId: "develop",
            concurrency: 2,
            barrier: true,
            failFast: false,
            items: [],
            inputClosed: false,
        });
    });
});

describe("addItems", () => {
    it("queues the arriving items in arrival order", () => {
        const state = addItems(createMapGroupState(buildMapGroup()), ["2", "1"]);

        expect(state.items).toEqual([
            { itemId: "2", status: "queued" },
            { itemId: "1", status: "queued" },
        ]);
    });

    it("ignores items the map already knows", () => {
        const state = addItems(addItems(createMapGroupState(buildMapGroup()), ["1"]), ["1", "2"]);

        expect(state.items.map((item) => item.itemId)).toEqual(["1", "2"]);
    });

    it("does not change the state it receives", () => {
        const original = createMapGroupState(buildMapGroup());

        addItems(original, ["1"]);

        expect(original.items).toEqual([]);
    });
});

describe("itemsToStart", () => {
    it("admits up to concurrency items in FIFO order", () => {
        const state = mapWithItems(["1", "2", "3", "4", "5"], { concurrency: 3 });

        expect(itemsToStart(state)).toEqual(["1", "2", "3"]);
    });

    it("admits nothing while concurrency items are running", () => {
        const state = startAdmittedItems(mapWithItems(["1", "2", "3", "4"], { concurrency: 3 }));

        expect(itemsToStart(state)).toEqual([]);
    });

    it("admits the next queued item when a running item finishes", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2", "3", "4"], { concurrency: 3 }));

        const state = onItemFinished(running, "2", "succeeded");

        expect(itemsToStart(state)).toEqual(["4"]);
    });

    it("counts a failed item as a free slot", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2"], { concurrency: 1 }));

        const state = onItemFinished(running, "1", "failed");

        expect(itemsToStart(state)).toEqual(["2"]);
    });

    it("admits items that arrive while the input is still open", () => {
        const state = addItems(createMapGroupState(buildMapGroup({ concurrency: 1 })), ["7"]);

        expect(itemsToStart(state)).toEqual(["7"]);
    });
});

describe("onItemFinished", () => {
    it("records the result of the item", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2"]));

        const state = onItemFinished(onItemFinished(running, "1", "failed"), "2", "succeeded");

        expect(state.items).toEqual([
            { itemId: "1", status: "failed" },
            { itemId: "2", status: "succeeded" },
        ]);
    });

    it("keeps the queue when an item fails without failFast", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2"], { concurrency: 1 }));

        const state = onItemFinished(running, "1", "failed");

        expect(itemIdsWithStatus(state, "queued")).toEqual(["2"]);
    });

    it("cancels the queued items when an item fails with failFast", () => {
        const running = startAdmittedItems(
            mapWithItems(["1", "2", "3", "4"], { concurrency: 2, failFast: true }),
        );

        const state = onItemFinished(running, "1", "failed");

        expect(state.items).toEqual([
            { itemId: "1", status: "failed" },
            { itemId: "2", status: "running" },
            { itemId: "3", status: "canceled" },
            { itemId: "4", status: "canceled" },
        ]);
        expect(itemsToStart(state)).toEqual([]);
    });
});

describe("reopenItem", () => {
    it.each(["succeeded", "failed"] as const)("runs a %s item again", (result) => {
        const finished = onItemFinished(startAdmittedItems(mapWithItems(["1", "2"])), "1", result);

        const reopened = reopenItem(finished, "1");

        expect(itemIdsWithStatus(reopened, "running")).toEqual(["1", "2"]);
    });

    it("leaves a queued item in the queue", () => {
        const state = mapWithItems(["1"], { concurrency: 1 });

        const reopened = reopenItem(state, "1");

        expect(itemIdsWithStatus(reopened, "queued")).toEqual(["1"]);
    });
});

describe("receiveItemsFromUpstream", () => {
    function finishedUpstream(results: Record<string, "succeeded" | "failed">): MapGroupState {
        const running = startAdmittedItems(mapWithItems(Object.keys(results)));

        return Object.entries(results).reduce(
            (state, [itemId, result]) => onItemFinished(state, itemId, result),
            running,
        );
    }

    it("receives the items that succeeded upstream and closes when the upstream is done", () => {
        const upstream = finishedUpstream({ "1": "succeeded", "2": "failed", "3": "succeeded" });

        const state = receiveItemsFromUpstream(createMapGroupState(buildMapGroup()), [upstream]);

        expect(state.items.map((item) => item.itemId)).toEqual(["1", "3"]);
        expect(state.inputClosed).toBe(true);
    });

    it("streams each succeeded item while the upstream is still running", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2"]));
        const upstream = onItemFinished(running, "2", "succeeded");

        const state = receiveItemsFromUpstream(createMapGroupState(buildMapGroup()), [upstream]);

        expect(state.items.map((item) => item.itemId)).toEqual(["2"]);
        expect(state.inputClosed).toBe(false);
    });

    it("receives nothing from a barrier upstream until it is done", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2"], { barrier: true }));
        const upstream = onItemFinished(running, "2", "succeeded");

        const state = receiveItemsFromUpstream(createMapGroupState(buildMapGroup()), [upstream]);

        expect(state.items).toEqual([]);
    });

    it("receives an item only once it succeeded in every upstream map", () => {
        const first = finishedUpstream({ "1": "succeeded", "2": "succeeded" });
        const second = finishedUpstream({ "1": "failed", "2": "succeeded" });

        const state = receiveItemsFromUpstream(createMapGroupState(buildMapGroup()), [
            first,
            second,
        ]);

        expect(state.items.map((item) => item.itemId)).toEqual(["2"]);
    });

    it("leaves a map without upstream maps waiting for its list", () => {
        const listFed = createMapGroupState(buildMapGroup());

        expect(receiveItemsFromUpstream(listFed, [])).toBe(listFed);
    });

    it("returns the same state when nothing new arrives", () => {
        const upstream = finishedUpstream({ "1": "succeeded" });
        const received = receiveItemsFromUpstream(createMapGroupState(buildMapGroup()), [upstream]);

        expect(receiveItemsFromUpstream(received, [upstream])).toBe(received);
    });
});

describe("cancelQueuedItems", () => {
    it("cancels the queued items and leaves the running ones", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2"], { concurrency: 1 }));

        const state = cancelQueuedItems(running);

        expect(state.items).toEqual([
            { itemId: "1", status: "running" },
            { itemId: "2", status: "canceled" },
        ]);
    });
});

describe("isMapDone", () => {
    it("is done when the input is closed and every item finished", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2"]));

        const state = onItemFinished(onItemFinished(running, "1", "succeeded"), "2", "failed");

        expect(isMapDone(state)).toBe(true);
    });

    it("is not done while an item is still running", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2"]));

        const state = onItemFinished(running, "1", "succeeded");

        expect(isMapDone(state)).toBe(false);
    });

    it("is not done while more items can still arrive", () => {
        const open = startItems(addItems(createMapGroupState(buildMapGroup()), ["1"]), ["1"]);

        const state = onItemFinished(open, "1", "succeeded");

        expect(isMapDone(state)).toBe(false);
    });

    it("is done with an empty output when the list is empty", () => {
        const state = mapWithItems([]);

        expect(isMapDone(state)).toBe(true);
        expect(itemIdsWithStatus(state, "succeeded")).toEqual([]);
    });
});

describe("itemIdsWithStatus", () => {
    it("lists succeeded items in input order, not in finishing order", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2", "3"]));

        const finished = ["3", "1", "2"].reduce(
            (state, itemId) => onItemFinished(state, itemId, "succeeded"),
            running,
        );

        expect(itemIdsWithStatus(finished, "succeeded")).toEqual(["1", "2", "3"]);
    });
});

describe("mapProgress", () => {
    it("counts the items per status", () => {
        const running = startAdmittedItems(mapWithItems(["1", "2", "3", "4", "5"]));

        const state = onItemFinished(onItemFinished(running, "1", "succeeded"), "2", "failed");

        expect(mapProgress(state)).toEqual({ queued: 2, running: 1, succeeded: 1, failed: 1 });
    });
});
