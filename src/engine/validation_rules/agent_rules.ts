import type { AgentNode, ValidationContext } from "@/engine/graph_validation.js";
import { errorIssue, nodeTarget } from "@/engine/validation_rules/validation_issues.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

export function findEmptyPrompts(graph: FlowGraph): ValidationIssue[] {
    const agentsWithoutPrompt = agentNodes(graph).filter(
        (node) => node.config.prompt.trim() === "",
    );

    return agentsWithoutPrompt.map((node) =>
        errorIssue(
            "empty_prompt",
            `O agente "${node.label}" está sem prompt.`,
            nodeTarget(node.id),
        ),
    );
}

export function findUnknownToolProfiles(
    graph: FlowGraph,
    context: ValidationContext,
): ValidationIssue[] {
    const knownIds = context.knownToolProfileIds;
    if (!knownIds) {
        return [];
    }

    const agentsWithUnknownProfile = agentNodes(graph).filter((node) =>
        isUnknownId(node.config.toolProfileId, knownIds),
    );

    return agentsWithUnknownProfile.map((node) =>
        errorIssue(
            "unknown_tool_profile",
            `O agente "${node.label}" usa um perfil de ferramentas que não existe.`,
            nodeTarget(node.id),
        ),
    );
}

export function findUnknownCredentials(
    graph: FlowGraph,
    context: ValidationContext,
): ValidationIssue[] {
    const knownIds = context.knownCredentialIds;
    if (!knownIds) {
        return [];
    }

    const agentsWithUnknownCredential = agentNodes(graph).filter((node) =>
        isUnknownId(node.config.credentialId, knownIds),
    );

    return agentsWithUnknownCredential.map((node) =>
        errorIssue(
            "unknown_credential",
            `O agente "${node.label}" usa uma credencial que não existe.`,
            nodeTarget(node.id),
        ),
    );
}

export function checkAgentPrompts(graph: FlowGraph, context: ValidationContext): ValidationIssue[] {
    return agentNodes(graph).flatMap((node) => context.checkPrompt?.(node, graph) ?? []);
}

function agentNodes(graph: FlowGraph): AgentNode[] {
    return graph.nodes.filter(isAgentNode);
}

function isAgentNode(node: FlowNode): node is AgentNode {
    return node.type === "agent";
}

function isUnknownId(id: string | undefined, knownIds: string[]): boolean {
    return id !== undefined && !knownIds.includes(id);
}
