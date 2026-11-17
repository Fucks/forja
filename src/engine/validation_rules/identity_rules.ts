import {
    edgeTarget,
    errorIssue,
    FLOW_TARGET,
    groupTarget,
    type IssueTarget,
    nodeTarget,
} from "@/engine/validation_rules/validation_issues.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

interface IdentifiedElement {
    id: string;
    target: IssueTarget;
}

export function findDuplicateIds(graph: FlowGraph): ValidationIssue[] {
    const elements = identifiedElements(graph);
    const repeatedElements = elements.filter(
        (element, index) => indexOfFirstWithId(elements, element.id) < index,
    );

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

// `nodes.<slug>` paths name a node by the slug of its label, so two nodes must not share one.
export function findDuplicateNodeSlugs(graph: FlowGraph): ValidationIssue[] {
    const seenSlugs = new Set<string>();
    const issues: ValidationIssue[] = [];
    for (const node of graph.nodes) {
        const slug = nodeSlug(node.label);
        if (seenSlugs.has(slug)) {
            issues.push(duplicateNodeSlugIssue(node.id, slug));
        }
        seenSlugs.add(slug);
    }

    return issues;
}

function duplicateNodeSlugIssue(nodeId: string, slug: string): ValidationIssue {
    const message = `Dois nós com o mesmo nome (${slug}): renomeie um deles`;

    return errorIssue("duplicate_node_slug", message, nodeTarget(nodeId));
}

function identifiedElements(graph: FlowGraph): IdentifiedElement[] {
    return [
        ...graph.nodes.map((node) => ({ id: node.id, target: nodeTarget(node.id) })),
        ...graph.edges.map((edge) => ({ id: edge.id, target: edgeTarget(edge.id) })),
        ...graph.groups.map((group) => ({ id: group.id, target: groupTarget(group.id) })),
    ];
}

function indexOfFirstWithId(elements: IdentifiedElement[], id: string): number {
    return elements.findIndex((element) => element.id === id);
}
