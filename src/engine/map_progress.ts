import {
    groupMembers,
    isMapGroup,
    nodesInsideGroup,
    type MapGroup,
} from "@/engine/graph_queries.js";
import type { MapProgress } from "@/engine/map_group.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { NodeRunStatusName } from "@/shared/events.js";
import type { FlowGraph } from "@/shared/flow_graph.js";

/** Only what the progress depends on, so it also counts the NodeRuns the API serializes. */
export type NodeRunProgressFields = Pick<NodeRunState, "nodeId" | "workItemId" | "status">;

type ItemProgress = keyof MapProgress;

const IN_PROGRESS_STATUSES: ReadonlySet<NodeRunStatusName> = new Set<NodeRunStatusName>([
    "RUNNING",
    "WAITING_APPROVAL",
    "WAITING_LIMIT",
    "INTERRUPTED",
]);

const FAILED_STATUSES: ReadonlySet<NodeRunStatusName> = new Set<NodeRunStatusName>([
    "FAILED",
    "CANCELED",
]);

const SUCCESSFUL_STATUSES: ReadonlySet<NodeRunStatusName> = new Set<NodeRunStatusName>([
    "SUCCEEDED",
    "SKIPPED",
]);

export function progressOfMaps(
    graph: FlowGraph,
    nodeRuns: NodeRunProgressFields[],
): Record<string, MapProgress> {
    const mapGroups = graph.groups.filter(isMapGroup);

    return Object.fromEntries(
        mapGroups.map((mapGroup) => [mapGroup.id, progressOfMap(graph, mapGroup, nodeRuns)]),
    );
}

function progressOfMap(
    graph: FlowGraph,
    mapGroup: MapGroup,
    nodeRuns: NodeRunProgressFields[],
): MapProgress {
    const progress: MapProgress = { queued: 0, running: 0, succeeded: 0, failed: 0 };
    const nodeRunsByItem = latestNodeRunsByItemInside(graph, mapGroup, nodeRuns);
    const directNodeIds = groupMembers(graph, mapGroup.id).nodeIds;

    for (const itemNodeRuns of nodeRunsByItem.values()) {
        progress[itemProgressOf(itemNodeRuns, directNodeIds)] += 1;
    }

    return progress;
}

// NodeRuns are listed in the order they were created, so a later attempt replaces the earlier one.
function latestNodeRunsByItemInside(
    graph: FlowGraph,
    mapGroup: MapGroup,
    nodeRuns: NodeRunProgressFields[],
): Map<string, Map<string, NodeRunProgressFields>> {
    const nodeIdsInside = new Set(nodesInsideGroup(graph, mapGroup.id).map((node) => node.id));
    const latestByItem = new Map<string, Map<string, NodeRunProgressFields>>();

    for (const nodeRun of nodeRuns) {
        const { workItemId, nodeId } = nodeRun;
        if (workItemId === undefined || !nodeIdsInside.has(nodeId)) {
            continue;
        }

        const latestByNode =
            latestByItem.get(workItemId) ?? new Map<string, NodeRunProgressFields>();
        latestByNode.set(nodeId, nodeRun);
        latestByItem.set(workItemId, latestByNode);
    }

    return latestByItem;
}

// Nodes inside a nested loop may never run, so only the nodes placed directly in the map must succeed.
function itemProgressOf(
    latestByNode: Map<string, NodeRunProgressFields>,
    directNodeIds: string[],
): ItemProgress {
    const statuses = [...latestByNode.values()].map((nodeRun) => nodeRun.status);
    if (statuses.some((status) => IN_PROGRESS_STATUSES.has(status))) {
        return "running";
    }
    if (statuses.some((status) => FAILED_STATUSES.has(status))) {
        return "failed";
    }

    const hasEveryNodeSucceeded = directNodeIds.every((nodeId) => {
        const status = latestByNode.get(nodeId)?.status;
        return status !== undefined && SUCCESSFUL_STATUSES.has(status);
    });

    return hasEveryNodeSucceeded ? "succeeded" : "queued";
}
