import {
    findNode,
    groupBoundaryEdges,
    isLoopGroup,
    isNodeInsideGroup,
    type LoopGroup,
    nodesInsideGroup,
    outgoingEdges,
} from "@/engine/graph_queries.js";
import {
    errorIssue,
    groupTarget,
    nodeTarget,
    warningIssue,
} from "@/engine/validation_rules/validation_issues.js";
import { assertNever } from "@/lib/assert_never.js";
import { type Condition, CONDITION_PATH_SEPARATOR } from "@/shared/conditions.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

type CycleNodeIds = [firstNodeId: string, ...otherNodeIds: string[]];

export function findCyclesOutsideLoops(graph: FlowGraph): ValidationIssue[] {
    const cyclesOutsideLoops = findCycles(graph).filter(
        (cycleNodeIds) => !isInsideOneLoop(graph, cycleNodeIds),
    );

    return cyclesOutsideLoops.map((cycleNodeIds) =>
        errorIssue(
            "cycle_outside_loop",
            `Ciclo fora de um grupo loop entre os nós ${describeNodes(graph, cycleNodeIds)}.`,
            nodeTarget(cycleNodeIds[0]),
        ),
    );
}

export function findLoopsWithoutBackEdge(graph: FlowGraph): ValidationIssue[] {
    const loopsWithoutBackEdge = graph.groups
        .filter(isLoopGroup)
        .filter((loop) => groupBoundaryEdges(graph, loop.id).back.length === 0);

    return loopsWithoutBackEdge.map((loop) =>
        warningIssue(
            "loop_without_back_edge",
            `O loop "${loop.label}" não tem aresta de volta entre seus nós.`,
            groupTarget(loop.id),
        ),
    );
}

export function findUnknownLoopConditionPaths(graph: FlowGraph): ValidationIssue[] {
    return graph.groups
        .filter(isLoopGroup)
        .flatMap((loop) => findUnknownConditionPathsOfLoop(graph, loop));
}

type ReachabilityCheck = (fromNodeId: string, toNodeId: string) => boolean;

function findCycles(graph: FlowGraph): CycleNodeIds[] {
    const reachableIdsByNodeId = new Map(
        graph.nodes.map((node) => [node.id, findReachableNodeIds(graph, node.id)]),
    );
    const canReach: ReachabilityCheck = (fromNodeId, toNodeId) =>
        reachableIdsByNodeId.get(fromNodeId)?.has(toNodeId) ?? false;
    const nodeIdsOnCycles = [...reachableIdsByNodeId.keys()]
        .sort()
        .filter((nodeId) => canReach(nodeId, nodeId));

    const cycles: CycleNodeIds[] = [];
    for (const nodeId of nodeIdsOnCycles) {
        const isAlreadyInCycle = cycles.some((cycleNodeIds) => cycleNodeIds.includes(nodeId));
        if (!isAlreadyInCycle) {
            cycles.push(collectCycleOf(nodeId, nodeIdsOnCycles, canReach));
        }
    }

    return cycles;
}

function collectCycleOf(
    nodeId: string,
    nodeIdsOnCycles: string[],
    canReach: ReachabilityCheck,
): CycleNodeIds {
    const otherIdsInCycle = nodeIdsOnCycles.filter(
        (otherId) => otherId !== nodeId && canReach(nodeId, otherId) && canReach(otherId, nodeId),
    );

    return [nodeId, ...otherIdsInCycle];
}

function findReachableNodeIds(graph: FlowGraph, startNodeId: string): Set<string> {
    const reachableIds = new Set<string>();
    const visit = (nodeId: string): void => {
        for (const edge of outgoingEdges(graph, nodeId)) {
            if (!reachableIds.has(edge.to.nodeId)) {
                reachableIds.add(edge.to.nodeId);
                visit(edge.to.nodeId);
            }
        }
    };

    visit(startNodeId);
    return reachableIds;
}

function isInsideOneLoop(graph: FlowGraph, nodeIds: string[]): boolean {
    return graph.groups
        .filter(isLoopGroup)
        .some((loop) => nodeIds.every((nodeId) => isNodeInsideGroup(graph, nodeId, loop.id)));
}

function describeNodes(graph: FlowGraph, nodeIds: string[]): string {
    return nodeIds.map((nodeId) => `"${findNode(graph, nodeId)?.label ?? nodeId}"`).join(", ");
}

function findUnknownConditionPathsOfLoop(graph: FlowGraph, loop: LoopGroup): ValidationIssue[] {
    const loopNodes = nodesInsideGroup(graph, loop.id);
    const knownNames = new Set(
        loopNodes.flatMap((node) => [
            nodeSlug(node.label),
            ...node.outputs.map((port) => port.name),
        ]),
    );
    const unknownPaths = listConditionPaths(loop.config.until).filter(
        (path) => !knownNames.has(firstPathSegment(path)),
    );

    return unknownPaths.map((path) =>
        warningIssue(
            "loop_condition_unknown_port",
            `A condição do loop "${loop.label}" usa "${path}", que não existe no loop.`,
            groupTarget(loop.id),
        ),
    );
}

function listConditionPaths(condition: Condition): string[] {
    switch (condition.op) {
        case "eq":
        case "neq":
        case "gt":
        case "lt":
        case "exists":
            return [condition.path];
        case "and":
        case "or":
            return condition.conditions.flatMap(listConditionPaths);
        case "not":
            return listConditionPaths(condition.condition);
        default:
            return assertNever(condition);
    }
}

function firstPathSegment(path: string): string {
    return path.split(CONDITION_PATH_SEPARATOR)[0] ?? path;
}
