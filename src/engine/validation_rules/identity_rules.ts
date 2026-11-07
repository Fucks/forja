import {
    edgeTarget,
    errorIssue,
    FLOW_TARGET,
    groupTarget,
    type IssueTarget,
    nodeTarget,
} from "@/engine/validation_rules/validation_issues.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

interface IdentifiedElement {
    id: string;
    target: IssueTarget;
}

export function findDuplicateIds(graph: FlowGraph): ValidationIssue[] {
    const seenIds = new Set<string>();
    const repeatedElements = identifiedElements(graph).filter((element) => {
        const isRepeated = seenIds.has(element.id);
        seenIds.add(element.id);
        return isRepeated;
    });

    return repeatedElements.map((element) =>
        errorIssue("duplicate_id", `O id "${element.id}" está repetido no fluxo.`, element.target),
    );
}

export function checkTriggerCount(graph: FlowGraph): ValidationIssue[] {
    const triggers = graph.nodes.filter((node) => node.type === "trigger");
    if (triggers.length === 0) {
        return [errorIssue("no_trigger", "O fluxo precisa de um nó de gatilho.", FLOW_TARGET)];
    }

    if (triggers.length === 1) {
        return [];
    }

    const message = `O fluxo tem ${triggers.length} gatilhos; deve ter exatamente um.`;
    return triggers.map((trigger) => errorIssue("many_triggers", message, nodeTarget(trigger.id)));
}

function identifiedElements(graph: FlowGraph): IdentifiedElement[] {
    return [
        ...graph.nodes.map((node) => ({ id: node.id, target: nodeTarget(node.id) })),
        ...graph.edges.map((edge) => ({ id: edge.id, target: edgeTarget(edge.id) })),
        ...graph.groups.map((group) => ({ id: group.id, target: groupTarget(group.id) })),
    ];
}
