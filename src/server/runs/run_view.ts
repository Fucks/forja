import {
    groupMembers,
    isMapGroup,
    nodesInsideGroup,
    type MapGroup,
} from "@/engine/graph_queries.js";
import type { MapProgress } from "@/engine/map_group.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RunRecord } from "@/server/runs/run_repository.js";
import type { NodeRunStatusName } from "@/shared/events.js";
import type { FlowGraph } from "@/shared/flow_graph.js";

export interface RunView {
    run: RunRecord & { flowName: string };
    nodeRuns: NodeRunState[];
    groups: Record<string, MapProgress>;
    // Of the run's version, never the draft.
    graph: FlowGraph;
    // The live screen reconnects to the event stream from here without losing events.
    lastEventId: number;
}

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

export function buildRunView(
    run: RunRecord,
    nodeRuns: NodeRunState[],
    graph: FlowGraph,
    flowName: string,
    lastEventId: number,
): RunView {
    return {
        run: { ...run, flowName },
        nodeRuns,
        groups: progressOfMaps(graph, nodeRuns),
        graph,
        lastEventId,
    };
}

function progressOfMaps(graph: FlowGraph, nodeRuns: NodeRunState[]): Record<string, MapProgress> {
    const mapGroups = graph.groups.filter(isMapGroup);

    return Object.fromEntries(
        mapGroups.map((mapGroup) => [mapGroup.id, progressOfMap(graph, mapGroup, nodeRuns)]),
    );
}

function progressOfMap(
    graph: FlowGraph,
    mapGroup: MapGroup,
    nodeRuns: NodeRunState[],
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
    nodeRuns: NodeRunState[],
): Map<string, Map<string, NodeRunState>> {
    const nodeIdsInside = new Set(nodesInsideGroup(graph, mapGroup.id).map((node) => node.id));
    const latestByItem = new Map<string, Map<string, NodeRunState>>();

    for (const nodeRun of nodeRuns) {
        const { workItemId, nodeId } = nodeRun;
        if (workItemId === undefined || !nodeIdsInside.has(nodeId)) {
            continue;
        }

        const latestByNode = latestByItem.get(workItemId) ?? new Map<string, NodeRunState>();
        latestByNode.set(nodeId, nodeRun);
        latestByItem.set(workItemId, latestByNode);
    }

    return latestByItem;
}

// Nodes inside a nested loop may never run, so only the nodes placed directly in the map must succeed.
function itemProgressOf(
    latestByNode: Map<string, NodeRunState>,
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
