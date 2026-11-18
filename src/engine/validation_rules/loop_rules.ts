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
    quote,
    warningIssue,
} from "@/engine/validation_rules/validation_issues.js";
import { listConditionPaths } from "@/shared/conditions.js";
import { findNodeSlugInPath } from "@/shared/data_context.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

const LOOP_CONDITION_FIELD = "until";

type CycleNodeIds = [firstNodeId: string, ...otherNodeIds: string[]];

export function findCyclesOutsideLoops(graph: FlowGraph): ValidationIssue[] {
    const cyclesOutsideLoops = findCycles(graph).filter(
        (cycleNodeIds) => !isInsideOneLoop(graph, cycleNodeIds),
    );

    return cyclesOutsideLoops.map((cycleNodeIds) =>
        errorIssue({
            code: "cycle_outside_loop",
            message:
                `Os nós ${describeNodes(graph, cycleNodeIds)} formam uma volta fora de um Loop, ` +
                "que nunca terminaria.",
            fix: "Selecione esses nós e agrupe-os num Loop, ou apague a ligação que volta.",
            target: nodeTarget(cycleNodeIds[0]),
        }),
    );
}

export function findLoopsWithoutBackEdge(graph: FlowGraph): ValidationIssue[] {
    const loopsWithoutBackEdge = graph.groups
        .filter(isLoopGroup)
        .filter((loop) => groupBoundaryEdges(graph, loop.id).back.length === 0);

    return loopsWithoutBackEdge.map((loop) =>
        warningIssue({
            code: "loop_without_back_edge",
            message:
                `O Loop ${quote(loop.label)} não tem ligação de volta, ` +
                "então uma volta não recebe nada da anterior.",
            fix: "Ligue a saída do último nó do Loop a uma entrada do primeiro.",
            target: groupTarget(loop.id),
        }),
    );
}

export function findLoopsWithoutCondition(graph: FlowGraph): ValidationIssue[] {
    const loopsWithoutCondition = graph.groups
        .filter(isLoopGroup)
        .filter((loop) => listConditionPaths(loop.config.until).some(isBlankPath));

    return loopsWithoutCondition.map((loop) =>
        errorIssue({
            code: "loop_without_condition",
            message: `O Loop ${quote(loop.label)} não sabe quando parar.`,
            fix: "Escolha o dado e a regra em Configurar › Parar quando.",
            fieldKey: LOOP_CONDITION_FIELD,
            target: groupTarget(loop.id),
        }),
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
    return nodeIds.map((nodeId) => quote(findNode(graph, nodeId)?.label ?? nodeId)).join(", ");
}

function findUnknownConditionPathsOfLoop(graph: FlowGraph, loop: LoopGroup): ValidationIssue[] {
    const loopNodeSlugs = new Set(
        nodesInsideGroup(graph, loop.id).map((node) => nodeSlug(node.label)),
    );
    const unknownPaths = listConditionPaths(loop.config.until).filter(
        (path) => !isBlankPath(path) && !readsLoopNode(path, loopNodeSlugs),
    );

    return unknownPaths.map((path) =>
        warningIssue({
            code: "loop_condition_unknown_port",
            message:
                `A condição de parada do Loop ${quote(loop.label)} lê ${quote(path)}, ` +
                "que não vem de um nó do Loop.",
            fix: "Escolha no seletor de Parar quando um dado de um nó de dentro do Loop.",
            fieldKey: LOOP_CONDITION_FIELD,
            target: groupTarget(loop.id),
        }),
    );
}

function isBlankPath(path: string): boolean {
    return path.trim() === "";
}

function readsLoopNode(path: string, loopNodeSlugs: Set<string>): boolean {
    const readNodeSlug = findNodeSlugInPath(path);

    return readNodeSlug !== undefined && loopNodeSlugs.has(readNodeSlug);
}
