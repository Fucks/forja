import {
    edgeTarget,
    errorIssue,
    FLOW_TARGET,
    groupTarget,
    type IssueTarget,
    nodeTarget,
    quote,
} from "@/engine/validation_rules/validation_issues.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
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
        errorIssue({
            code: "duplicate_id",
            message: `Dois elementos do fluxo usam o mesmo id ${quote(element.id)}.`,
            fix: "Apague um deles e crie-o de novo pela paleta; num YAML importado, troque o id.",
            target: element.target,
        }),
    );
}

export function checkTriggerCount(graph: FlowGraph): ValidationIssue[] {
    const triggers = graph.nodes.filter((node) => node.type === "trigger");
    if (triggers.length === 0) {
        return [
            errorIssue({
                code: "no_trigger",
                message: "O fluxo não tem Gatilho, então nada o faz começar.",
                fix: "Arraste um Gatilho da paleta (categoria Início) para o canvas.",
                target: FLOW_TARGET,
            }),
        ];
    }

    if (triggers.length === 1) {
        return [];
    }

    const message = `O fluxo tem ${triggers.length} Gatilhos, mas só pode ter um.`;
    return triggers.map((trigger) =>
        errorIssue({
            code: "many_triggers",
            message,
            fix: "Apague os Gatilhos a mais e deixe só um.",
            target: nodeTarget(trigger.id),
        }),
    );
}

// `nodes.<slug>` paths name a node by the slug of its label, so two nodes must not share one.
export function findDuplicateNodeSlugs(graph: FlowGraph): ValidationIssue[] {
    const seenSlugs = new Set<string>();
    const issues: ValidationIssue[] = [];
    for (const node of graph.nodes) {
        const slug = nodeSlug(node.label);
        if (seenSlugs.has(slug)) {
            issues.push(duplicateNodeSlugIssue(node));
        }
        seenSlugs.add(slug);
    }

    return issues;
}

function duplicateNodeSlugIssue(node: FlowNode): ValidationIssue {
    return errorIssue({
        code: "duplicate_node_slug",
        message: `O nó ${quote(node.label.trim())} tem o mesmo nome de outro nó.`,
        fix:
            "Dê outro rótulo a este nó no topo do inspector: " +
            "os dados de um nó são lidos pelo nome.",
        fieldKey: "label",
        target: nodeTarget(node.id),
    });
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
