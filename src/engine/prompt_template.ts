export interface TemplateToken {
    kind: "text" | "var";
    value: string;
    start: number;
    end: number;
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
