import type { FlowPlan } from "@/engine/flow_plan.js";
import {
    addItems,
    cancelQueuedItems,
    closeInput,
    itemIdsWithStatus,
    itemsToStart,
    type MapGroupState,
    type MapItemResult,
    mapProgress,
    onItemFinished,
    receiveItemsFromUpstream,
    startItems,
} from "@/engine/map_group.js";
import { MapGroupRegistry } from "@/engine/map_group_registry.js";
import type { NodeRunRegistry } from "@/engine/node_run_registry.js";
import { NODE_RUN_TERMINAL, type NodeRunState } from "@/engine/node_run_state.js";
import type { SchedulerCommand } from "@/engine/scheduler_types.js";

export interface MapGroupCoordinatorDependencies {
    plan: FlowPlan;
    nodeRuns: NodeRunRegistry;
    // From a snapshot; empty for a new run.
    savedStates: MapGroupState[];
    createPendingNodeRuns(nodeIds: string[], itemId: string): void;
    emit(command: SchedulerCommand): void;
}

export interface FinishedMapItem {
    mapGroup: MapGroupState;
    itemId: string;
    result: MapItemResult;
    hasFailedNodeRun: boolean;
}

// Moves the items of a run through its map groups: feeds each map, admits items within the map's
// concurrency and finishes an item when all its NodeRuns inside the map are terminal.
export class MapGroupCoordinator {
    private readonly plan: FlowPlan;
    private readonly nodeRuns: NodeRunRegistry;
    private readonly mapGroups: MapGroupRegistry;

    constructor(private readonly dependencies: MapGroupCoordinatorDependencies) {
        this.plan = dependencies.plan;
        this.nodeRuns = dependencies.nodeRuns;
        this.mapGroups = new MapGroupRegistry(
            dependencies.plan.mapGroups,
            dependencies.savedStates,
        );
    }

    states(): MapGroupState[] {
        return this.mapGroups.all();
    }

    mapGroupOf(nodeId: string): MapGroupState | undefined {
        return this.mapGroups.find(this.plan.mapGroupIdOf(nodeId));
    }

    feedItemList(itemIds: string[]): void {
        const listFedMapGroups = this.mapGroups
            .all()
            .filter((mapGroup) => this.plan.upstreamMapIdsOf(mapGroup.groupId).length === 0);
        for (const mapGroup of listFedMapGroups) {
            this.change(closeInput(addItems(mapGroup, itemIds)));
        }
    }

    // An item only has NodeRuns inside a map once the map admits it.
    admitQueuedItems(): void {
        for (const mapGroup of this.mapGroups.all()) {
            const admittedItemIds = itemsToStart(mapGroup);
            if (admittedItemIds.length === 0) {
                continue;
            }

            this.change(startItems(mapGroup, admittedItemIds));
            const memberNodeIds = this.plan.memberNodeIdsOf(mapGroup.groupId);
            for (const itemId of admittedItemIds) {
                this.dependencies.createPendingNodeRuns(memberNodeIds, itemId);
            }
        }
    }

    finishSettledItems(): FinishedMapItem[] {
        const finishedItems: FinishedMapItem[] = [];
        for (const mapGroup of this.mapGroups.all()) {
            const settledItemIds = itemIdsWithStatus(mapGroup, "running").filter((itemId) =>
                this.isItemSettled(mapGroup.groupId, itemId),
            );
            for (const itemId of settledItemIds) {
                finishedItems.push(this.finishItem(mapGroup.groupId, itemId));
            }
        }

        return finishedItems;
    }

    feedCorrelatedMaps(): boolean {
        let hasReceivedItems = false;
        for (const mapGroup of this.mapGroups.all()) {
            const received = receiveItemsFromUpstream(mapGroup, this.upstreamStatesOf(mapGroup));
            if (received !== mapGroup) {
                this.change(received);
                hasReceivedItems = true;
            }
        }

        return hasReceivedItems;
    }

    cancelQueuedItems(): void {
        for (const mapGroup of this.mapGroups.all()) {
            if (itemIdsWithStatus(mapGroup, "queued").length > 0) {
                this.change(cancelQueuedItems(mapGroup));
            }
        }
    }

    runningNodeRunsOf(mapGroup: MapGroupState): NodeRunState[] {
        return itemIdsWithStatus(mapGroup, "running")
            .flatMap((itemId) => this.memberNodeRunsOf(mapGroup.groupId, itemId))
            .filter((nodeRun) => nodeRun.status === "RUNNING");
    }

    private isItemSettled(mapGroupId: string, itemId: string): boolean {
        return this.memberNodeRunsOf(mapGroupId, itemId).every((nodeRun) =>
            NODE_RUN_TERMINAL.has(nodeRun.status),
        );
    }

    private finishItem(mapGroupId: string, itemId: string): FinishedMapItem {
        const memberNodeRuns = this.memberNodeRunsOf(mapGroupId, itemId);
        const result = itemResultOf(memberNodeRuns);
        const finished = onItemFinished(this.mapGroups.get(mapGroupId), itemId, result);
        this.change(finished);

        return {
            mapGroup: finished,
            itemId,
            result,
            hasFailedNodeRun: memberNodeRuns.some((nodeRun) => nodeRun.status === "FAILED"),
        };
    }

    private upstreamStatesOf(mapGroup: MapGroupState): MapGroupState[] {
        return this.plan
            .upstreamMapIdsOf(mapGroup.groupId)
            .map((upstreamId) => this.mapGroups.get(upstreamId));
    }

    private memberNodeRunsOf(mapGroupId: string, itemId: string): NodeRunState[] {
        return this.plan
            .memberNodeIdsOf(mapGroupId)
            .map((nodeId) => this.nodeRuns.find(nodeId, itemId))
            .filter((nodeRun) => nodeRun !== undefined);
    }

    private change(mapGroup: MapGroupState): void {
        this.mapGroups.save(mapGroup);
        this.dependencies.emit({
            type: "group_progress",
            groupId: mapGroup.groupId,
            ...mapProgress(mapGroup),
        });
    }
}

// Skipped NodeRuns (a branch not taken) do not fail the item.
function itemResultOf(memberNodeRuns: NodeRunState[]): MapItemResult {
    const hasSucceeded = memberNodeRuns.every(
        (nodeRun) => nodeRun.status === "SUCCEEDED" || nodeRun.status === "SKIPPED",
    );

    return hasSucceeded ? "succeeded" : "failed";
}
