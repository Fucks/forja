import type { VariableInfo } from "@/engine/prompt_template.js";

export interface PromptCompletionOption {
    label: string;
    detail: string;
}

export interface PromptCompletions {
    from: number;
    options: PromptCompletionOption[];
}

const VARIABLE_OPENING = "{{";

// An unescaped "{{" followed only by spaces and a (possibly empty) variable path, up to the cursor.
const OPEN_VARIABLE_AT_CURSOR = /(?<!\\)\{\{(?<spaces>\s*)(?<prefix>[\w.]*)$/;

export function promptCompletions(
    vars: VariableInfo[],
    textBeforeCursor: string,
): PromptCompletions | null {
    const openVariable = OPEN_VARIABLE_AT_CURSOR.exec(textBeforeCursor);
    if (!openVariable?.groups) {
        return null;
    }

    const { spaces = "", prefix = "" } = openVariable.groups;
    const prefixStart = openVariable.index + VARIABLE_OPENING.length + spaces.length;

    return {
        from: prefixStart,
        options: vars.filter((variable) => variable.path.startsWith(prefix)).map(toOption),
    };
}

function toOption(variable: VariableInfo): PromptCompletionOption {
    return { label: variable.path, detail: `${variable.type} · ${variable.description}` };
}
