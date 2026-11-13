import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

import type { GroupProgress } from "@/web/canvas/base/group_frame.js";
import type { ExecutionStatus } from "@/web/components/ui/execution_status.js";

export interface NodeLiveState {
    status?: ExecutionStatus;
    badge?: string;
    progress?: GroupProgress;
}

type Listener = () => void;

const NO_LIVE_STATE: NodeLiveState = {};

// Each node subscribes to its own id, so a run event re-renders only the nodes whose state changed
// instead of all of them.
export class NodeLiveStore {
    private states: ReadonlyMap<string, NodeLiveState>;
    private readonly listenersById = new Map<string, Set<Listener>>();

    constructor(initialStates: ReadonlyMap<string, NodeLiveState> = new Map()) {
        this.states = initialStates;
    }

    stateOf(id: string): NodeLiveState {
        return this.states.get(id) ?? NO_LIVE_STATE;
    }

    subscribe(id: string, listener: Listener): () => void {
        const listeners = this.listenersById.get(id) ?? new Set<Listener>();
        listeners.add(listener);
        this.listenersById.set(id, listeners);

        return () => listeners.delete(listener);
    }

    publish(nextStates: ReadonlyMap<string, NodeLiveState>): void {
        const previousStates = this.states;
        this.states = new Map(
            [...nextStates].map(([id, nextState]) => [
                id,
                keepWhenUnchanged(previousStates.get(id), nextState),
            ]),
        );

        const ids = new Set([...previousStates.keys(), ...nextStates.keys()]);
        [...ids]
            .filter((id) => previousStates.get(id) !== this.states.get(id))
            .forEach((id) => this.notify(id));
    }

    private notify(id: string): void {
        this.listenersById.get(id)?.forEach((listener) => listener());
    }
}

// The editor leaves the store empty; the live run view (#63) publishes the state of each node and
// group by id.
export const NodeLiveContext = createContext(new NodeLiveStore());

export function useNodeLiveState(id: string): NodeLiveState {
    const store = useContext(NodeLiveContext);
    const subscribe = useCallback(
        (listener: Listener) => store.subscribe(id, listener),
        [store, id],
    );

    return useSyncExternalStore(subscribe, () => store.stateOf(id));
}

// A node re-renders when its state is another object, so an unchanged state keeps the old one.
function keepWhenUnchanged(
    currentState: NodeLiveState | undefined,
    nextState: NodeLiveState,
): NodeLiveState {
    if (currentState && isSameLiveState(currentState, nextState)) {
        return currentState;
    }

    return nextState;
}

function isSameLiveState(current: NodeLiveState, next: NodeLiveState): boolean {
    return (
        current.status === next.status &&
        current.badge === next.badge &&
        isSameProgress(current.progress, next.progress)
    );
}

function isSameProgress(current?: GroupProgress, next?: GroupProgress): boolean {
    if (!current || !next) {
        return current === next;
    }

    return (
        current.queued === next.queued &&
        current.running === next.running &&
        current.succeeded === next.succeeded &&
        current.failed === next.failed
    );
}
