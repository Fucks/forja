import { topologicalOrder } from "@/engine/graph_queries.js";
import { type NodeScope, planNodeScopes, splitsListIntoItems } from "@/engine/node_scopes.js";
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from "@/shared/flow_graph.js";

const NODE_TYPES_LIMITED_BY_CONCURRENCY: ReadonlySet<NodeType> = new Set<NodeType>([
    "agent",
    "script",
]);

// Everything the scheduler asks about the graph, computed once per run.
export class FlowPlan {
    readonly nodeIdsInDagOrder: string[];
    private readonly nodesById: Map<string, FlowNode>;
    private readonly scopes: Map<string, NodeScope>;
    private readonly dagPositions: Map<string, number>;

    constructor(readonly graph: FlowGraph) {
        this.nodeIdsInDagOrder = topologicalOrder(graph);
        this.nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
        this.scopes = planNodeScopes(graph);
        this.dagPositions = new Map(this.nodeIdsInDagOrder.map((id, index) => [id, index]));
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
