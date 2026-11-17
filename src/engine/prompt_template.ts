import { listUpstreamNodes } from "@/engine/graph_queries.js";
import { lookUpPath } from "@/shared/conditions.js";
import { type DataContext, findNodeSlugInPath } from "@/shared/data_context.js";
import type { FlowGraph, FlowGroup, FlowNode, NodeOfType, Port } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

export interface TemplateToken {
    kind: "text" | "var";
    value: string;
    start: number;
    end: number;
}

export class PromptRenderError extends Error {
    constructor(readonly variable: string) {
        super(`Variável sem valor no prompt: {{${variable}}}`);
        this.name = "PromptRenderError";
    }
}

const ESCAPED_OPENING = "\\{{";
const LITERAL_OPENING = "{{";
const TEMPLATE_MARKUP_PATTERN = /\\\{\{|\{\{(?<path>[^{}]*)\}\}/g;

export function parsePromptTemplate(template: string): TemplateToken[] {
    const tokens: TemplateToken[] = [];
    let textStart = 0;

    for (const match of template.matchAll(TEMPLATE_MARKUP_PATTERN)) {
        const variablePath = match.groups?.path;
        const isEscapedOpening = variablePath === undefined;
        if (isEscapedOpening) {
            continue;
        }

        const variableEnd = match.index + match[0].length;
        tokens.push(...textTokensBetween(template, textStart, match.index));
        tokens.push({
            kind: "var",
            value: variablePath.trim(),
            start: match.index,
            end: variableEnd,
        });
        textStart = variableEnd;
    }

    return [...tokens, ...textTokensBetween(template, textStart, template.length)];
}

function textTokensBetween(template: string, start: number, end: number): TemplateToken[] {
    if (start === end) {
        return [];
    }

    const value = template.slice(start, end).replaceAll(ESCAPED_OPENING, LITERAL_OPENING);

    return [{ kind: "text", value, start, end }];
}

const JSON_INDENT_SPACES = 2;

export function renderPrompt(template: string, context: DataContext): string {
    const renderedTokens = parsePromptTemplate(template).map((token) => {
        if (token.kind === "text") {
            return token.value;
        }

        return formatVariableValue(resolveVariable(token.value, context));
    });

    return renderedTokens.join("");
}

function resolveVariable(variable: string, context: DataContext): unknown {
    const lookup = lookUpPath(context, variable);
    if (!lookup.isFound || lookup.value === undefined) {
        throw new PromptRenderError(variable);
    }

    return lookup.value;
}

function formatVariableValue(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    return JSON.stringify(value, null, JSON_INDENT_SPACES);
}

export interface VariableInfo {
    path: string;
    description: string;
    type: string;
}

const ITEM_VARIABLES: VariableInfo[] = [
    { path: "item.id", description: "Identificador do item de trabalho", type: "string" },
    { path: "item.title", description: "Título do item", type: "string" },
    { path: "item.body", description: "Descrição do item", type: "string" },
    { path: "item.number", description: "Número da issue no GitHub", type: "number" },
    { path: "item.url", description: "Endereço da issue no GitHub", type: "string" },
    { path: "item.labels", description: "Labels do item", type: "string[]" },
    { path: "item.branch", description: "Branch de trabalho do item", type: "string" },
];

const PROJECT_VARIABLES: VariableInfo[] = [
    { path: "project.name", description: "Nome do projeto", type: "string" },
    { path: "project.baseBranch", description: "Branch base do projeto", type: "string" },
    { path: "project.githubRepo", description: "Repositório do GitHub", type: "string" },
];

const RUN_VARIABLES: VariableInfo[] = [
    { path: "run.iteration", description: "Iteração atual do loop", type: "number" },
    { path: "run.attempt", description: "Tentativa atual do nó", type: "number" },
];

const CARRIED_VALUE_TYPE = "any";

export function availableVariables(node: FlowNode, graph: FlowGraph): VariableInfo[] {
    const enclosingGroups = findEnclosingGroups(node, graph.groups);
    const variables = [
        ...node.inputs.map(toInputVariable),
        ...carriedInputVariables(enclosingGroups),
        ...itemVariables(node, enclosingGroups),
        ...PROJECT_VARIABLES,
        ...RUN_VARIABLES,
    ];

    return withoutRepeatedPaths(variables);
}

function findEnclosingGroups(node: FlowNode, groups: FlowGroup[]): FlowGroup[] {
    const enclosingGroups: FlowGroup[] = [];

    let group = findGroupById(groups, node.parentGroupId);
    while (group && !enclosingGroups.includes(group)) {
        enclosingGroups.push(group);
        group = findGroupById(groups, group.parentGroupId);
    }

    return enclosingGroups;
}

function findGroupById(groups: FlowGroup[], groupId: string | undefined): FlowGroup | undefined {
    return groups.find((group) => group.id === groupId);
}

function toInputVariable(port: Port): VariableInfo {
    return { path: `inputs.${port.name}`, description: `Entrada "${port.name}"`, type: port.type };
}

function carriedInputVariables(enclosingGroups: FlowGroup[]): VariableInfo[] {
    return enclosingGroups.flatMap((group) => {
        if (group.kind !== "loop") {
            return [];
        }

        return group.config.carry.map((portName) => ({
            path: `inputs.${portName}`,
            description: `Valor de "${portName}" na iteração anterior de "${group.label}"`,
            type: CARRIED_VALUE_TYPE,
        }));
    });
}

function itemVariables(node: FlowNode, enclosingGroups: FlowGroup[]): VariableInfo[] {
    const hasItemPort = node.inputs.some((port) => port.type === "workItem");
    const isInsideMap = enclosingGroups.some((group) => group.kind === "map");
    if (!hasItemPort && !isInsideMap) {
        return [];
    }

    return ITEM_VARIABLES;
}

function withoutRepeatedPaths(variables: VariableInfo[]): VariableInfo[] {
    return variables.filter(
        (variable, index) => variables.findIndex((other) => other.path === variable.path) === index,
    );
}

export type AgentNode = NodeOfType<"agent">;

interface KnownVariables {
    paths: Set<string>;
    upstreamNodeSlugs: Set<string>;
}

export function checkPromptVariables(node: AgentNode, graph: FlowGraph): ValidationIssue[] {
    const known: KnownVariables = {
        paths: new Set(availableVariables(node, graph).map((variable) => variable.path)),
        upstreamNodeSlugs: new Set(
            listUpstreamNodes(graph, node.id).map((upstreamNode) => nodeSlug(upstreamNode.label)),
        ),
    };

    return parsePromptTemplate(node.config.prompt)
        .filter((token) => token.kind === "var")
        .flatMap((token) => findVariableIssues(node, token.value, known));
}

function findVariableIssues(
    node: AgentNode,
    variable: string,
    known: KnownVariables,
): ValidationIssue[] {
    const readNodeSlug = findNodeSlugInPath(variable);
    if (readNodeSlug === undefined) {
        return known.paths.has(variable) ? [] : [buildUnknownVariableIssue(node, variable)];
    }
    if (!known.upstreamNodeSlugs.has(readNodeSlug)) {
        return [buildNodeNotUpstreamIssue(node, variable)];
    }

    return [];
}

function buildUnknownVariableIssue(node: AgentNode, variable: string): ValidationIssue {
    return {
        level: "error",
        code: "unknown_variable",
        message: `Variável desconhecida no prompt de "${node.label}": {{${variable}}}`,
        target: { kind: "node", id: node.id },
    };
}

function buildNodeNotUpstreamIssue(node: AgentNode, variable: string): ValidationIssue {
    return {
        level: "error",
        code: "variable_node_not_upstream",
        message: `Variável aponta para um nó que não vem antes deste: {{${variable}}}`,
        target: { kind: "node", id: node.id },
    };
}
