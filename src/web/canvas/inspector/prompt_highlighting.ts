import { parsePromptTemplate } from "@/engine/prompt_template.js";

export interface PromptVariableRange {
    from: number;
    to: number;
    isKnown: boolean;
}

export function findPromptVariables(
    prompt: string,
    knownPaths: ReadonlySet<string>,
): PromptVariableRange[] {
    return parsePromptTemplate(prompt)
        .filter((token) => token.kind === "var")
        .map((token) => ({
            from: token.start,
            to: token.end,
            isKnown: knownPaths.has(token.value),
        }));
}
