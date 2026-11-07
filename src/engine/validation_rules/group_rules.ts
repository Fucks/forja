import {
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
} from "@/engine/validation_rules/validation_issues.js";
import type { FlowGraph, FlowGroup } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

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
        errorIssue(
            "group_overlap",
            `O nó "${node.label}" está dentro de um grupo que não existe.`,
            nodeTarget(node.id),
        ),
    );
}

function findGroupsWithInvalidParent(graph: FlowGraph): ValidationIssue[] {
    return graph.groups.flatMap((group) => {
        if (group.parentGroupId !== undefined && !hasGroup(graph, group.parentGroupId)) {
            return [groupOverlapIssue(group, "está dentro de um grupo que não existe")];
        }

        if (groupAncestors(graph, group.id).includes(group)) {
            return [groupOverlapIssue(group, "está contido em si mesmo")];
        }

        return [];
    });
}

function groupOverlapIssue(group: FlowGroup, problem: string): ValidationIssue {
    return errorIssue(
        "group_overlap",
        `O grupo "${group.label}" ${problem}.`,
        groupTarget(group.id),
    );
}

function hasGroup(graph: FlowGraph, groupId: string): boolean {
    return graph.groups.some((group) => group.id === groupId);
}

function checkMapListInput(graph: FlowGraph, map: MapGroup): ValidationIssue[] {
    const enteringEdges = groupBoundaryEdges(graph, map.id).entering;
    const listEdgeCount = enteringEdges.filter(
        (edge) => findSourcePort(graph, edge)?.type === "workItemList",
    ).length;
    const hasCorrelatedEdges = enteringEdges.some((edge) => isItemCorrelatedEdge(graph, edge));

    if (listEdgeCount === 0 && !hasCorrelatedEdges) {
        return [
            errorIssue(
                "map_without_list_input",
                `O map "${map.label}" não recebe uma lista de itens nem itens de outro map.`,
                groupTarget(map.id),
            ),
        ];
    }

    if (listEdgeCount > 1 || (listEdgeCount === 1 && hasCorrelatedEdges)) {
        return [
            errorIssue(
                "map_many_list_inputs",
                `O map "${map.label}" recebe itens de mais de uma origem.`,
                groupTarget(map.id),
            ),
        ];
    }

    return [];
}
