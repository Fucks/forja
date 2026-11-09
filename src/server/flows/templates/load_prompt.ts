import { readFileSync } from "node:fs";

import { runtimeAssetPath } from "@/lib/paths.js";

export type TemplatePromptName = "tl_spec" | "developer" | "reviewer";

export interface PromptSection {
    title: string;
    body: string;
}

const TEMPLATE_PROMPTS_DIR = ["flows", "templates", "prompts"];
const PROMPT_FILE_EXTENSION = ".md";

export function loadPrompt(name: TemplatePromptName): string {
    const promptFile = runtimeAssetPath(
        "prompts",
        ...TEMPLATE_PROMPTS_DIR,
        `${name}${PROMPT_FILE_EXTENSION}`,
    );

    return readFileSync(promptFile, "utf8");
}

// The shared prompts serve several templates; a section adds the inputs only one template has.
export function appendPromptSection(prompt: string, section: PromptSection): string {
    return `${prompt.trimEnd()}\n\n# ${section.title}\n\n${section.body}\n`;
}
