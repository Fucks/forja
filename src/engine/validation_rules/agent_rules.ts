import { AGENT_RESULT_PORT } from "@/engine/available_data.js";
import { isLoopGroup } from "@/engine/graph_queries.js";
import type { AgentNode, ValidationContext } from "@/engine/graph_validation.js";
import {
    errorIssue,
    nodeTarget,
    quote,
    warningIssue,
} from "@/engine/validation_rules/validation_issues.js";
import {
    CONDITION_PATH_SEPARATOR,
    type Condition,
    listConditionPaths,
} from "@/shared/conditions.js";
import { NODES_ROOT } from "@/shared/data_context.js";
import type { FlowGraph, FlowNode, NodeOfType } from "@/shared/flow_graph.js";
import { listDecisionConditions } from "@/shared/node_configs/condition_branches.js";
import { nodeSlug } from "@/shared/node_slug.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

export function findEmptyPrompts(graph: FlowGraph): ValidationIssue[] {
    const agentsWithoutPrompt = agentNodes(graph).filter(
        (node) => node.config.prompt.trim() === "",
    );

    return agentsWithoutPrompt.map((node) =>
        errorIssue({
            code: "empty_prompt",
            message: `O Agente ${quote(node.label)} não tem prompt.`,
            fix: "Escreva o que o agente deve fazer na aba Configurar › Prompt.",
            fieldKey: "prompt",
            target: nodeTarget(node.id),
        }),
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
        errorIssue({
            code: "unknown_tool_profile",
            message:
                `O Agente ${quote(node.label)} usa um perfil de ferramentas ` +
                "que não existe mais.",
            fix: "Escolha outro perfil em Configurar › Avançado › Ferramentas.",
            fieldKey: "toolProfileId",
            target: nodeTarget(node.id),
        }),
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
        errorIssue({
            code: "unknown_credential",
            message: `O Agente ${quote(node.label)} usa uma credencial que não existe mais.`,
            fix: "Escolha outra credencial em Configurar › Avançado › Credencial.",
            fieldKey: "credentialId",
            target: nodeTarget(node.id),
        }),
    );
}

export function findAgentsWithoutResponseFormat(graph: FlowGraph): ValidationIssue[] {
    const slugsWithResultRead = new Set(
        listGraphConditions(graph)
            .flatMap(listConditionPaths)
            .flatMap((path) => findSlugWhoseResultFieldIsRead(path) ?? []),
    );
    const agentsWithoutFormat = agentNodes(graph).filter(
        (node) =>
            node.config.outputSchema === undefined && slugsWithResultRead.has(nodeSlug(node.label)),
    );

    return agentsWithoutFormat.map((node) =>
        warningIssue({
            code: "agent_without_response_format",
            message:
                `Uma condição lê o resultado do Agente ${quote(node.label)}, ` +
                "mas ele não tem Formato da resposta.",
            fix: "Adicione em Configurar › Formato da resposta os campos que a condição lê.",
            fieldKey: "outputSchema",
            target: nodeTarget(node.id),
        }),
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
        .flatMap((node) => listDecisionConditions(node.config));
    const loopConditions = graph.groups.filter(isLoopGroup).map((loop) => loop.config.until);

    return [...decisionConditions, ...loopConditions];
}

// A path such as `nodes.dev.result.approved` reads the field `approved` of the agent `dev`.
function findSlugWhoseResultFieldIsRead(path: string): string | undefined {
    const [root, slug, port, field] = path.split(CONDITION_PATH_SEPARATOR);
    const readsResultField =
        root === NODES_ROOT && port === AGENT_RESULT_PORT && field !== undefined;
    if (!readsResultField) {
        return undefined;
    }

    return slug;
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
