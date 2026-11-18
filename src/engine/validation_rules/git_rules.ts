import { incomingEdges, listUpstreamNodes } from "@/engine/graph_queries.js";
import { nodeTarget, quote, warningIssue } from "@/engine/validation_rules/validation_issues.js";
import { findInputPortInPath, findNodeSlugInPath } from "@/shared/data_context.js";
import { type FlowGraph, isNodeOfType, type NodeOfType } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

type GitNode = NodeOfType<"git">;

export function findGitBodySourceProblems(graph: FlowGraph): ValidationIssue[] {
    const gitNodes = graph.nodes.filter((node) => isNodeOfType(node, "git"));

    return gitNodes.flatMap((gitNode) => checkGitBodySource(graph, gitNode));
}

export function checkGitBodySource(graph: FlowGraph, gitNode: GitNode): ValidationIssue[] {
    const { bodyFrom } = gitNode.config;
    if (bodyFrom === undefined || canReadBodySource(graph, gitNode, bodyFrom)) {
        return [];
    }

    return [
        warningIssue({
            code: "git_body_source_missing",
            message:
                `O texto do PR de ${quote(gitNode.label)} vem de ${quote(bodyFrom)}, ` +
                "que não chega a este nó.",
            fix: "Escolha o texto do PR no seletor de Configurar › Texto do PR vem de.",
            fieldKey: "bodyFrom",
            target: nodeTarget(gitNode.id),
        }),
    ];
}

// Paths under the other roots (item, run, project) always exist, so only inputs and nodes are checked.
function canReadBodySource(graph: FlowGraph, gitNode: GitNode, bodyFrom: string): boolean {
    const inputPort = findInputPortInPath(bodyFrom);
    if (inputPort !== undefined) {
        return isConnectedInput(graph, gitNode, inputPort);
    }

    const readNodeSlug = findNodeSlugInPath(bodyFrom);
    if (readNodeSlug !== undefined) {
        return isUpstreamNodeSlug(graph, gitNode, readNodeSlug);
    }

    return true;
}

function isConnectedInput(graph: FlowGraph, gitNode: GitNode, port: string): boolean {
    const hasPort = gitNode.inputs.some((input) => input.name === port);
    const hasEdge = incomingEdges(graph, gitNode.id).some((edge) => edge.to.port === port);

    return hasPort && hasEdge;
}

function isUpstreamNodeSlug(graph: FlowGraph, gitNode: GitNode, slug: string): boolean {
    return listUpstreamNodes(graph, gitNode.id).some((node) => nodeSlug(node.label) === slug);
}
