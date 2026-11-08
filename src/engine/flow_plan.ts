import {
    enclosingGroups,
    enclosingMapGroup,
    groupBoundaryEdges,
    isItemCorrelatedEdge,
    isLoopGroup,
    isMapGroup,
    isNodeInsideGroup,
    type LoopGroup,
    type MapGroup,
    topologicalOrder,
} from "@/engine/graph_queries.js";
import { type NodeScope, planNodeScopes, splitsListIntoItems } from "@/engine/node_scopes.js";
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from "@/shared/flow_graph.js";

const NODE_TYPES_LIMITED_BY_CONCURRENCY: ReadonlySet<NodeType> = new Set<NodeType>([
    "agent",
    "script",
]);

const NO_RETRIES = 0;

// Everything the scheduler asks about the graph, computed once per run.
export class FlowPlan {
    readonly nodeIdsInDagOrder: string[];
    readonly mapGroups: MapGroup[];
    readonly loopGroups: LoopGroup[];
    private readonly nodesById: Map<string, FlowNode>;
    private readonly scopes: Map<string, NodeScope>;
    private readonly dagPositions: Map<string, number>;
    private readonly mapGroupIdsByNodeId: Map<string, string>;
    private readonly upstreamMapIdsByMapId: Map<string, string[]>;
    private readonly loopGroupsByNodeId: Map<string, LoopGroup>;
    private readonly loopBackEdges: Set<FlowEdge>;

    constructor(readonly graph: FlowGraph) {
        this.nodeIdsInDagOrder = topologicalOrder(graph);
        this.mapGroups = graph.groups.filter(isMapGroup);
        this.nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
        this.scopes = planNodeScopes(graph);
        this.dagPositions = new Map(this.nodeIdsInDagOrder.map((id, index) => [id, index]));
        this.mapGroupIdsByNodeId = planMapMembership(graph);
        this.upstreamMapIdsByMapId = planUpstreamMaps(graph);
        this.loopGroups = graph.groups.filter(isLoopGroup);
        this.loopGroupsByNodeId = planLoopMembership(graph);
        this.loopBackEdges = new Set(
            this.loopGroups.flatMap((loop) => groupBoundaryEdges(graph, loop.id).back),
        );
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

    // The innermost loop around the node.
    loopGroupOf(nodeId: string): LoopGroup | undefined {
        return this.loopGroupsByNodeId.get(nodeId);
    }

    memberNodeIdsOfLoop(loopGroupId: string): string[] {
        return this.nodeIdsInDagOrder.filter(
            (nodeId) => this.loopGroupOf(nodeId)?.id === loopGroupId,
        );
    }

    findLoopGroup(groupId: string): LoopGroup | undefined {
        return this.loopGroups.find((loop) => loop.id === groupId);
    }

    isLoopBackEdge(edge: FlowEdge): boolean {
        return this.loopBackEdges.has(edge);
    }

    // The loop the edge leaves: its source node is inside the loop and its target is not.
    loopGroupLeftBy(edge: FlowEdge): LoopGroup | undefined {
        const sourceLoop = this.loopGroupOf(edge.from.nodeId);
        if (!sourceLoop || isNodeInsideGroup(this.graph, edge.to.nodeId, sourceLoop.id)) {
            return undefined;
        }

        return sourceLoop;
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

    // Only agents have their own retries; the workspace retries of the policy apply to every node.
    maxRetriesOf(nodeId: string): number {
        const node = this.findNode(nodeId);

        return node?.type === "agent" ? node.config.retries : NO_RETRIES;
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

function planLoopMembership(graph: FlowGraph): Map<string, LoopGroup> {
    const loopGroupsByNodeId = new Map<string, LoopGroup>();
    for (const node of graph.nodes) {
        const loopGroup = enclosingGroups(graph, node.id).find(isLoopGroup);
        if (loopGroup) {
            loopGroupsByNodeId.set(node.id, loopGroup);
        }
    }

    return loopGroupsByNodeId;
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
