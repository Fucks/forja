import {
    findGroup,
    groupAncestors,
    groupBoundaryEdges,
    isItemCorrelatedEdge,
    isMapGroup,
    type MapGroup,
} from "@/engine/graph_queries.js";
import { findSourcePort } from "@/engine/validation_rules/graph_lookups.js";
import {
    errorIssue,
    groupTarget,
    nodeTarget,
    quote,
} from "@/engine/validation_rules/validation_issues.js";
import type { FlowGraph, FlowGroup } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

const GROUP_OVERLAP_CODE = "group_overlap";

export function findGroupOverlaps(graph: FlowGraph): ValidationIssue[] {
    return [...findNodesInMissingGroups(graph), ...findGroupsWithInvalidParent(graph)];
}

export function findMapListInputProblems(graph: FlowGraph): ValidationIssue[] {
    return graph.groups.filter(isMapGroup).flatMap((map) => checkMapListInput(graph, map));
}

function findNodesInMissingGroups(graph: FlowGraph): ValidationIssue[] {
    const nodesInMissingGroups = graph.nodes.filter(
        (node) => node.parentGroupId !== undefined && !hasGroup(graph, node.parentGroupId),
    );

    return nodesInMissingGroups.map((node) =>
        errorIssue({
            code: GROUP_OVERLAP_CODE,
            message: `O nó ${quote(node.label)} está dentro de um grupo que não existe mais.`,
            fix: "Arraste o nó para fora do grupo e depois para dentro do grupo certo.",
            target: nodeTarget(node.id),
        }),
    );
}

function findGroupsWithInvalidParent(graph: FlowGraph): ValidationIssue[] {
    return graph.groups.flatMap((group) => {
        if (group.parentGroupId !== undefined && !hasGroup(graph, group.parentGroupId)) {
            return [groupOverlapIssue(group, "está dentro de um grupo que não existe mais")];
        }

        if (groupAncestors(graph, group.id).includes(group)) {
            return [groupOverlapIssue(group, "está dentro de si mesmo")];
        }

        return [];
    });
}

function groupOverlapIssue(group: FlowGroup, problem: string): ValidationIssue {
    return errorIssue({
        code: GROUP_OVERLAP_CODE,
        message: `O grupo ${quote(group.label)} ${problem}.`,
        fix: `Desagrupe ${quote(group.label)} e agrupe os nós de novo.`,
        target: groupTarget(group.id),
    });
}

function hasGroup(graph: FlowGraph, groupId: string): boolean {
    return findGroup(graph, groupId) !== undefined;
}

function checkMapListInput(graph: FlowGraph, map: MapGroup): ValidationIssue[] {
    const enteringEdges = groupBoundaryEdges(graph, map.id).entering;
    const listEdgeCount = enteringEdges.filter(
        (edge) => findSourcePort(graph, edge)?.type === "workItemList",
    ).length;
    const hasCorrelatedEdges = enteringEdges.some((edge) => isItemCorrelatedEdge(graph, edge));

    if (listEdgeCount === 0 && !hasCorrelatedEdges) {
        return [
            errorIssue({
                code: "map_without_list_input",
                message: `O Map ${quote(map.label)} não recebe itens para processar.`,
                fix:
                    "Ligue a saída Itens encontrados de uma Fonte a um nó dentro do Map " +
                    `${quote(map.label)}, ou ligue a ele um nó de outro Map.`,
                target: groupTarget(map.id),
            }),
        ];
    }

    if (listEdgeCount > 1 || (listEdgeCount === 1 && hasCorrelatedEdges)) {
        return [
            errorIssue({
                code: "map_many_list_inputs",
                message: `O Map ${quote(map.label)} recebe itens de mais de uma origem.`,
                fix: "Apague as ligações a mais e deixe só uma origem de itens entrando no Map.",
                target: groupTarget(map.id),
            }),
        ];
    }

    return [];
}
