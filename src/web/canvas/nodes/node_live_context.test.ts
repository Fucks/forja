import { NodeLiveStore } from "@/web/canvas/nodes/node_live_context.js";
import type { NodeLiveState } from "@/web/canvas/nodes/node_live_context.js";

describe("NodeLiveStore", () => {
    it("notifies only the nodes whose state changed", () => {
        const store = new NodeLiveStore(liveStates({ dev: { status: "QUEUED" }, tl: {} }));
        const developerListener = vi.fn();
        const techLeadListener = vi.fn();
        store.subscribe("dev", developerListener);
        store.subscribe("tl", techLeadListener);

        store.publish(liveStates({ dev: { status: "RUNNING" }, tl: {} }));

        expect(developerListener).toHaveBeenCalledOnce();
        expect(techLeadListener).not.toHaveBeenCalled();
        expect(store.stateOf("dev")).toEqual({ status: "RUNNING" });
    });

    it("keeps the same state object when an equal state is published", () => {
        const progress = { queued: 1, running: 2, succeeded: 3, failed: 0 };
        const store = new NodeLiveStore(liveStates({ develop: { progress } }));
        const previousState = store.stateOf("develop");

        store.publish(liveStates({ develop: { progress: { ...progress } } }));

        expect(store.stateOf("develop")).toBe(previousState);
    });

    it("notifies a node whose state is no longer published", () => {
        const store = new NodeLiveStore(liveStates({ dev: { status: "RUNNING" } }));
        const developerListener = vi.fn();
        store.subscribe("dev", developerListener);

        store.publish(new Map());

        expect(developerListener).toHaveBeenCalledOnce();
        expect(store.stateOf("dev")).toEqual({});
    });

    it("stops notifying a listener after it unsubscribes", () => {
        const store = new NodeLiveStore();
        const developerListener = vi.fn();
        const unsubscribe = store.subscribe("dev", developerListener);

        unsubscribe();
        store.publish(liveStates({ dev: { status: "RUNNING" } }));

        expect(developerListener).not.toHaveBeenCalled();
    });
});

function liveStates(statesById: Record<string, NodeLiveState>): Map<string, NodeLiveState> {
    return new Map(Object.entries(statesById));
}
