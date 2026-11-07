import {
    enclosingMapGroup,
    isItemCorrelatedEdge,
    isMapGroup,
    type MapGroup,
    topologicalOrder,
} from "@/engine/graph_queries.js";
import { type NodeScope, planNodeScopes, splitsListIntoItems } from "@/engine/node_scopes.js";
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from "@/shared/flow_graph.js";

const NODE_TYPES_LIMITED_BY_CONCURRENCY: ReadonlySet<NodeType> = new Set<NodeType>([
    "agent",
    "script",
]);

// Everything the scheduler asks about the graph, computed once per run.
export class FlowPlan {
    readonly nodeIdsInDagOrder: string[];
    readonly mapGroups: MapGroup[];
    private readonly nodesById: Map<string, FlowNode>;
    private readonly scopes: Map<string, NodeScope>;
    private readonly dagPositions: Map<string, number>;
    private readonly mapGroupIdsByNodeId: Map<string, string>;
    private readonly upstreamMapIdsByMapId: Map<string, string[]>;

    constructor(readonly graph: FlowGraph) {
        this.nodeIdsInDagOrder = topologicalOrder(graph);
        this.mapGroups = graph.groups.filter(isMapGroup);
        this.nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
        this.scopes = planNodeScopes(graph);
        this.dagPositions = new Map(this.nodeIdsInDagOrder.map((id, index) => [id, index]));
        this.mapGroupIdsByNodeId = planMapMembership(graph);
        this.upstreamMapIdsByMapId = planUpstreamMaps(graph);
    }

    findNode(nodeId: string): FlowNode | undefined {
        return this.nodesById.get(nodeId);
    }

    scopeOf(nodeId: string): NodeScope {
        return this.scopes.get(nodeId) ?? "run";
    }

    nodeIdsOfScope(scope: NodeScope): string[] {
        return this.nodeIdsInDagOrder.filter((nodeId) => this.scopeOf(nodeId) === scope);
    }

    itemNodeIdsOutsideMaps(): string[] {
        return this.nodeIdsOfScope("item").filter((nodeId) => !this.mapGroupIdOf(nodeId));
    }

    // The innermost map around the node.
    mapGroupIdOf(nodeId: string): string | undefined {
        return this.mapGroupIdsByNodeId.get(nodeId);
    }

    memberNodeIdsOf(mapGroupId: string): string[] {
        return this.nodeIdsInDagOrder.filter((nodeId) => this.mapGroupIdOf(nodeId) === mapGroupId);
    }

    // Maps whose items feed this map through item-correlated edges; empty for a list-fed map.
    upstreamMapIdsOf(mapGroupId: string): string[] {
        return this.upstreamMapIdsByMapId.get(mapGroupId) ?? [];
    }

    triggerNodeIds(): string[] {
        return this.graph.nodes.filter((node) => node.type === "trigger").map((node) => node.id);
    }

    dagPositionOf(nodeId: string): number {
        return this.dagPositions.get(nodeId) ?? 0;
    }

    isLimitedByConcurrency(nodeId: string): boolean {
        const node = this.findNode(nodeId);

        return node !== undefined && NODE_TYPES_LIMITED_BY_CONCURRENCY.has(node.type);
    }

    findEdgeSplittingListIntoItems(nodeId: string): FlowEdge | undefined {
        return this.graph.edges.find(
            (edge) => edge.from.nodeId === nodeId && splitsListIntoItems(this.graph, edge),
        );
    }
}

function planMapMembership(graph: FlowGraph): Map<string, string> {
    const mapGroupIdsByNodeId = new Map<string, string>();
    for (const node of graph.nodes) {
        const mapGroup = enclosingMapGroup(graph, node.id);
        if (mapGroup) {
            mapGroupIdsByNodeId.set(node.id, mapGroup.id);
        }
    }

    return mapGroupIdsByNodeId;
}

function planUpstreamMaps(graph: FlowGraph): Map<string, string[]> {
    const upstreamMapIdsByMapId = new Map<string, string[]>();
    for (const edge of graph.edges.filter((candidate) => isItemCorrelatedEdge(graph, candidate))) {
        const upstreamMap = enclosingMapGroup(graph, edge.from.nodeId);
        const downstreamMap = enclosingMapGroup(graph, edge.to.nodeId);
        if (!upstreamMap || !downstreamMap) {
            continue;
        }

        const knownUpstreamIds = upstreamMapIdsByMapId.get(downstreamMap.id) ?? [];
        if (!knownUpstreamIds.includes(upstreamMap.id)) {
            upstreamMapIdsByMapId.set(downstreamMap.id, [...knownUpstreamIds, upstreamMap.id]);
        }
    }

    return upstreamMapIdsByMapId;
}
