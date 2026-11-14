import type { AgentRunRequest } from "@/integrations/agent_runtime/agent_runtime.js";

export interface ClaudeIterationOptions {
    iteration: number;
    resumeSessionId?: string;
    /** Sends the output schema even on an iteration that would not get it. */
    withOutputSchema?: boolean;
}

const CLAUDE_HEADLESS_COMMAND = ["claude", "-p", "--output-format", "stream-json", "--verbose"];

/** The prompt goes through stdin and secrets through the environment: neither is ever in argv. */
export function buildClaudeArgs(
    request: AgentRunRequest,
    options: ClaudeIterationOptions,
): string[] {
    return [
        ...CLAUDE_HEADLESS_COMMAND,
        "--model",
        request.model,
        "--effort",
        request.effort,
        ...optionalFlag("--max-turns", request.maxTurns),
        ...optionalFlag("--max-budget-usd", request.maxBudgetUsd),
        "--permission-mode",
        request.permissionMode,
        ...outputSchemaArgs(request, options),
        ...optionalFlag("--resume", options.resumeSessionId),
        ...request.toolArgs,
    ];
}

function optionalFlag(flag: string, value: string | number | undefined): string[] {
    if (value === undefined) {
        return [];
    }

    return [flag, String(value)];
}

function outputSchemaArgs(request: AgentRunRequest, options: ClaudeIterationOptions): string[] {
    const sendsSchema = options.withOutputSchema ?? sendsOutputSchema(request, options.iteration);
    if (!request.outputSchema || !sendsSchema) {
        return [];
    }

    return ["--json-schema", JSON.stringify(request.outputSchema)];
}

/** Whether the iteration gets `--json-schema` (only when the node has an output schema). */
export function sendsOutputSchema(request: AgentRunRequest, iteration: number): boolean {
    return request.outputSchema !== undefined && mayBeLastIteration(request, iteration);
}

// With a completion signal any iteration but the last one is expected to be followed by another;
// without it the loop stops on the first iteration that does not hit the turn limit.
function mayBeLastIteration(request: AgentRunRequest, iteration: number): boolean {
    if (request.completionSignal === undefined) {
        return true;
    }

    return iteration === request.maxIterations;
}
