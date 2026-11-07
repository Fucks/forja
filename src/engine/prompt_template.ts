import { lookUpPath } from "@/shared/conditions.js";
import type { FlowGraph, FlowGroup, FlowNode, Port } from "@/shared/flow_graph.js";

export interface TemplateToken {
    kind: "text" | "var";
    value: string;
    start: number;
    end: number;
}

export interface PromptContext {
    inputs: Record<string, unknown>;
    item?: {
        id: string;
        title: string;
        body: string;
        number?: number;
        url?: string;
        labels: string[];
        branch?: string;
    };
    project: { name: string; baseBranch: string; githubRepo?: string };
    run: { id: string; iteration: number; attempt: number };
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
        const path = match.groups?.path;
        if (path === undefined) {
            continue;
        }

        const variableEnd = match.index + match[0].length;
        tokens.push(...textTokensBetween(template, textStart, match.index));
        tokens.push({ kind: "var", value: path.trim(), start: match.index, end: variableEnd });
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

export function renderPrompt(template: string, context: PromptContext): string {
    const renderedTokens = parsePromptTemplate(template).map((token) => {
        if (token.kind === "text") {
            return token.value;
        }

        return formatVariableValue(resolveVariable(token.value, context));
    });

    return renderedTokens.join("");
}

function resolveVariable(variable: string, context: PromptContext): unknown {
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
    const findGroup = (groupId: string | undefined) => groups.find((group) => group.id === groupId);
    const enclosingGroups: FlowGroup[] = [];

    let group = findGroup(node.parentGroupId);
    while (group && !enclosingGroups.includes(group)) {
        enclosingGroups.push(group);
        group = findGroup(group.parentGroupId);
    }

    return enclosingGroups;
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
