import type { MapProgress } from "@/engine/map_group.js";
import { progressOfMaps } from "@/engine/map_progress.js";
import { formatCount } from "@/lib/format.js";
import type { NodeRunStatusName } from "@/shared/events.js";
import type { SerializedNodeRun, SerializedRunView } from "@/shared/run_types.js";
import type { NodeLiveState } from "@/web/canvas/nodes/node_live_context.js";
import type { ExecutionStatus } from "@/web/components/ui/execution_status.js";

export interface NodeAggregate {
    status: ExecutionStatus;
    running: number;
    queued: number;
    succeeded: number;
    failed: number;
    currentItems: string[];
}

const WAITING_STATUSES: readonly NodeRunStatusName[] = ["WAITING_LIMIT", "WAITING_APPROVAL"];
const UNSUCCESSFUL_STATUSES: ReadonlySet<NodeRunStatusName> = new Set<NodeRunStatusName>([
    "FAILED",
    "CANCELED",
]);
const CONCLUDED_STATUSES: ReadonlySet<NodeRunStatusName> = new Set<NodeRunStatusName>([
    "SUCCEEDED",
    "SKIPPED",
]);

const ITEM_NOUNS = { one: "item", other: "itens" };
const WITHOUT_ITEM = "";

export function aggregateNodeStates(
    view: SerializedRunView,
    filterItemId?: string,
): Map<string, NodeLiveState> {
    const nodeRuns = keepNodeRunsOfItem(view.nodeRuns, filterItemId);
    const nodeRunsByNode = groupByNode(nodeRuns);
    const liveStates = new Map<string, NodeLiveState>();

    for (const node of view.graph.nodes) {
        const aggregate = aggregateNodeRuns(nodeRunsByNode.get(node.id) ?? []);
        liveStates.set(node.id, toNodeLiveState(aggregate));
    }
    for (const [groupId, progress] of Object.entries(mapProgressOf(view, nodeRuns, filterItemId))) {
        liveStates.set(groupId, { progress });
    }

    return liveStates;
}

// NodeRuns without an item (the trigger, the source) belong to every item, so the filter keeps them.
function keepNodeRunsOfItem(
    nodeRuns: SerializedNodeRun[],
    filterItemId: string | undefined,
): SerializedNodeRun[] {
    if (filterItemId === undefined) {
        return nodeRuns;
    }

    return nodeRuns.filter(
        (nodeRun) => nodeRun.workItemId === undefined || nodeRun.workItemId === filterItemId,
    );
}

// The run view counts every item; one item's counters are worked out with the same rule.
function mapProgressOf(
    view: SerializedRunView,
    nodeRuns: SerializedNodeRun[],
    filterItemId: string | undefined,
): Record<string, MapProgress> {
    if (filterItemId === undefined) {
        return view.groups;
    }

    return progressOfMaps(view.graph, nodeRuns);
}

function aggregateNodeRuns(nodeRuns: SerializedNodeRun[]): NodeAggregate {
    const latestOfEachItem = [...latestNodeRunByItem(nodeRuns).values()];
    const countWithStatus = (status: NodeRunStatusName): number =>
        latestOfEachItem.filter((nodeRun) => nodeRun.status === status).length;

    return {
        status: statusOfNode(latestOfEachItem, nodeRuns.at(-1)),
        running: countWithStatus("RUNNING"),
        queued: countWithStatus("QUEUED"),
        succeeded: countWithStatus("SUCCEEDED"),
        failed: countWithStatus("FAILED"),
        currentItems: listRunningItems(latestOfEachItem),
    };
}

function statusOfNode(
    latestOfEachItem: SerializedNodeRun[],
    lastNodeRun: SerializedNodeRun | undefined,
): ExecutionStatus {
    const statuses = latestOfEachItem.map((nodeRun) => nodeRun.status);
    if (statuses.includes("RUNNING")) {
        return "RUNNING";
    }

    const waitingStatus = WAITING_STATUSES.find((status) => statuses.includes(status));
    if (waitingStatus) {
        return waitingStatus;
    }
    if (statuses.includes("QUEUED")) {
        return "QUEUED";
    }
    if (lastNodeRun && UNSUCCESSFUL_STATUSES.has(lastNodeRun.status)) {
        return lastNodeRun.status;
    }

    return statusOfConcludedNode(statuses);
}

function statusOfConcludedNode(statuses: NodeRunStatusName[]): ExecutionStatus {
    const hasEveryItemConcluded =
        statuses.length > 0 && statuses.every((status) => CONCLUDED_STATUSES.has(status));
    if (!hasEveryItemConcluded) {
        return "PENDING";
    }

    return statuses.every((status) => status === "SKIPPED") ? "SKIPPED" : "SUCCEEDED";
}

function listRunningItems(latestOfEachItem: SerializedNodeRun[]): string[] {
    return latestOfEachItem.flatMap((nodeRun) =>
        nodeRun.status === "RUNNING" && nodeRun.workItemId !== undefined
            ? [nodeRun.workItemId]
            : [],
    );
}

function toNodeLiveState({ status, currentItems }: NodeAggregate): NodeLiveState {
    if (currentItems.length === 0) {
        return { status };
    }

    return { status, badge: describeCurrentItems(currentItems) };
}

function describeCurrentItems(currentItems: string[]): string {
    const [onlyItem] = currentItems;
    if (currentItems.length === 1 && onlyItem !== undefined) {
        return `item #${onlyItem}`;
    }

    return formatCount(currentItems.length, ITEM_NOUNS);
}

function groupByNode(nodeRuns: SerializedNodeRun[]): Map<string, SerializedNodeRun[]> {
    const nodeRunsByNode = new Map<string, SerializedNodeRun[]>();
    for (const nodeRun of nodeRuns) {
        nodeRunsByNode.set(nodeRun.nodeId, [
            ...(nodeRunsByNode.get(nodeRun.nodeId) ?? []),
            nodeRun,
        ]);
    }

    return nodeRunsByNode;
}

// NodeRuns are listed in the order they were created, so a later attempt replaces the earlier one.
function latestNodeRunByItem(nodeRuns: SerializedNodeRun[]): Map<string, SerializedNodeRun> {
    return new Map(nodeRuns.map((nodeRun) => [itemKeyOf(nodeRun), nodeRun]));
}

function itemKeyOf(nodeRun: SerializedNodeRun): string {
    return nodeRun.workItemId ?? WITHOUT_ITEM;
}
