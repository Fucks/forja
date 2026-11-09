export interface PromptCommandResult {
    exitCode: number;
    stdoutTail: string;
}

export type PromptCommandRunner = (command: string) => Promise<PromptCommandResult>;

const PROMPT_COMMAND_PATTERN = /!`([^`\n]+)`/g;
const CODE_FENCE_PATTERN = /^\s*(```|~~~)/;
const LINE_BREAK_KEPT_AT_LINE_END = /(?<=\n)/;

/** Replaces each !`command` outside fenced code blocks with what the command prints. */
export async function expandPromptCommands(
    prompt: string,
    run: PromptCommandRunner,
): Promise<string> {
    let expanded = "";
    let isInsideCodeFence = false;

    for (const line of prompt.split(LINE_BREAK_KEPT_AT_LINE_END)) {
        const isFenceLine = CODE_FENCE_PATTERN.test(line);
        if (isFenceLine) {
            isInsideCodeFence = !isInsideCodeFence;
        }

        const isCode = isFenceLine || isInsideCodeFence;
        expanded += isCode ? line : await expandCommandsIn(line, run);
    }

    return expanded;
}

async function expandCommandsIn(text: string, run: PromptCommandRunner): Promise<string> {
    let expanded = "";
    let copiedUpTo = 0;

    for (const match of text.matchAll(PROMPT_COMMAND_PATTERN)) {
        const [placeholder, command = ""] = match;
        expanded += text.slice(copiedUpTo, match.index);
        expanded += describeCommandOutput(await run(command));
        copiedUpTo = match.index + placeholder.length;
    }

    return expanded + text.slice(copiedUpTo);
}

function describeCommandOutput(result: PromptCommandResult): string {
    const output = result.stdoutTail.trim();
    if (result.exitCode !== 0) {
        return `[comando falhou (exit ${result.exitCode}): ${output}]`;
    }

    return output;
}
