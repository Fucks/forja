import { AGENT_RESULT_PORT } from "@/engine/available_data.js";
import { isLoopGroup } from "@/engine/graph_queries.js";
import type { AgentNode, ValidationContext } from "@/engine/graph_validation.js";
import {
    errorIssue,
    nodeTarget,
    warningIssue,
} from "@/engine/validation_rules/validation_issues.js";
import {
    CONDITION_PATH_SEPARATOR,
    type Condition,
    listConditionPaths,
} from "@/shared/conditions.js";
import { findNodeSlugInPath } from "@/shared/data_context.js";
import type { FlowGraph, FlowNode, NodeOfType } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";
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

export function findAgentsWithoutResponseFormat(graph: FlowGraph): ValidationIssue[] {
    const slugsWithResultFieldsRead = new Set(
        listGraphConditions(graph).flatMap(listConditionPaths).flatMap(listSlugsWithResultFieldRead),
    );
    const agentsWithoutFormat = agentNodes(graph).filter(
        (node) =>
            node.config.outputSchema === undefined &&
            slugsWithResultFieldsRead.has(nodeSlug(node.label)),
    );

    return agentsWithoutFormat.map((node) =>
        warningIssue(
            "agent_without_response_format",
            `Uma condição lê o resultado do agente "${node.label}", mas ele não tem formato da resposta.`,
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

function listGraphConditions(graph: FlowGraph): Condition[] {
    const decisionConditions = graph.nodes
        .filter(isConditionNode)
        .map((node) => node.config.condition);
    const loopConditions = graph.groups.filter(isLoopGroup).map((loop) => loop.config.until);

    return [...decisionConditions, ...loopConditions];
}

function listSlugsWithResultFieldRead(path: string): string[] {
    const [, , port, field] = path.split(CONDITION_PATH_SEPARATOR);
    const slug = findNodeSlugInPath(path);
    if (slug === undefined || port !== AGENT_RESULT_PORT || field === undefined) {
        return [];
    }

    return [slug];
}

function isConditionNode(node: FlowNode): node is NodeOfType<"condition"> {
    return node.type === "condition";
}

function isAgentNode(node: FlowNode): node is AgentNode {
    return node.type === "agent";
}

function isUnknownId(id: string | undefined, knownIds: string[]): boolean {
    return id !== undefined && !knownIds.includes(id);
}
