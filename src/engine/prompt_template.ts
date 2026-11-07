import { lookUpPath } from "@/shared/conditions.js";

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
