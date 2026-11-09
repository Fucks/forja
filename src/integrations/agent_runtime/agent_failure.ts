import { AgentRuntimeError, UsageLimitError } from "@/integrations/agent_runtime/agent_errors.js";
import type { ClaudeResult } from "@/integrations/agent_runtime/claude_result.js";
import { parseUsageLimit } from "@/integrations/agent_runtime/usage_limit_parser.js";

export interface FailedIteration {
    result?: ClaudeResult;
    exitCode: number;
    stderrTail: string;
}

const BUDGET_EXCEEDED_MESSAGE = "orçamento do nó atingido";
const MISSING_RESULT_MESSAGE = "O agente terminou sem enviar o resultado";

export function isIterationFailure(iteration: FailedIteration): boolean {
    return !iteration.result || iteration.result.isError || iteration.exitCode !== 0;
}

/** The typed error for an iteration that failed: usage limit, budget, or any other failure. */
export function toAgentFailure(iteration: FailedIteration, now: Date): Error {
    const messages = failureMessagesOf(iteration);
    const usageLimitError = findUsageLimit(messages, now);
    if (usageLimitError) {
        return usageLimitError;
    }

    if (iteration.result?.subtype === "error_max_budget_usd") {
        return new AgentRuntimeError(BUDGET_EXCEEDED_MESSAGE);
    }

    return new AgentRuntimeError(messages[0] ?? describeExit(iteration.exitCode));
}

function failureMessagesOf({ result, stderrTail }: FailedIteration): string[] {
    const candidates = [result?.text, ...(result?.errors ?? []), stderrTail];

    return candidates.map((message) => message?.trim() ?? "").filter((message) => message !== "");
}

function findUsageLimit(messages: string[], now: Date): UsageLimitError | undefined {
    for (const message of messages) {
        const usageLimit = parseUsageLimit(message, now);
        if (usageLimit.isLimit) {
            return new UsageLimitError(usageLimit.resetAt);
        }
    }

    return undefined;
}

function describeExit(exitCode: number): string {
    if (exitCode === 0) {
        return MISSING_RESULT_MESSAGE;
    }

    return `O agente terminou com código ${exitCode}`;
}
