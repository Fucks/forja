import { createMapGroupState, type MapGroupState } from "@/engine/map_group.js";
import type { MapGroup } from "@/engine/graph_queries.js";

export class UnknownMapGroupError extends Error {
    constructor(readonly groupId: string) {
        super(`Map group ${groupId} is not part of this flow`);
        this.name = "UnknownMapGroupError";
    }
}

export class MapGroupRegistry {
    private readonly statesByGroupId: Map<string, MapGroupState>;

    // Saved states (from a snapshot) replace the fresh state of the same group.
    constructor(mapGroups: MapGroup[], savedStates: MapGroupState[]) {
        const states = [...mapGroups.map(createMapGroupState), ...savedStates];
        this.statesByGroupId = new Map(states.map((state) => [state.groupId, state]));
    }

    save(state: MapGroupState): void {
        this.statesByGroupId.set(state.groupId, state);
    }

    get(groupId: string): MapGroupState {
        const state = this.find(groupId);
        if (!state) {
            throw new UnknownMapGroupError(groupId);
        }

        return state;
    }

    find(groupId: string | undefined): MapGroupState | undefined {
        if (groupId === undefined) {
            return undefined;
        }

        return this.statesByGroupId.get(groupId);
    }

    all(): MapGroupState[] {
        return [...this.statesByGroupId.values()];
    }
}
