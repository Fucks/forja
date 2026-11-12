import type { ResultMessage } from "@/integrations/agent_runtime/stream_json_messages.js";
import { addTokenUsage, EMPTY_TOKEN_USAGE } from "@/shared/usage_types.js";
import type { TokenUsage } from "@/shared/usage_types.js";

type KnownResultSubtype =
    | "success"
    | "error_max_turns"
    | "error_during_execution"
    | "error_max_budget_usd"
    | "error_max_structured_output_retries";

// `string & {}` keeps the known subtypes in autocomplete while accepting new ones from newer CLIs.
export type ClaudeResultSubtype = KnownResultSubtype | (string & {});

export interface ClaudeResult {
    subtype: ClaudeResultSubtype;
    isError: boolean;
    text?: string;
    structuredOutput?: unknown;
    /** Sum of `modelUsage` when present (it includes subagents); otherwise `usage`. */
    usage: TokenUsage;
    costUsd?: number;
    numTurns?: number;
    sessionId?: string;
    durationMs?: number;
    permissionDenials: { toolName: string; reason?: string }[];
    errors: string[];
}

export function toClaudeResult(message: ResultMessage): ClaudeResult {
    return {
        subtype: message.subtype,
        isError: message.is_error,
        text: nonEmptyText(message.result),
        structuredOutput: message.structured_output,
        usage: totalUsageOf(message),
        costUsd: message.total_cost_usd,
        numTurns: message.num_turns,
        sessionId: message.session_id,
        durationMs: message.duration_ms,
        permissionDenials: message.permission_denials.map((denial) => ({
            toolName: denial.tool_name,
            reason: denial.reason,
        })),
        errors: message.errors,
    };
}

// A run that answers only with structured output reports an empty `result`.
function nonEmptyText(text: string | undefined): string | undefined {
    if (text === "") {
        return undefined;
    }

    return text;
}

function totalUsageOf(message: ResultMessage): TokenUsage {
    const perModelUsage = Object.values(message.modelUsage ?? {});
    if (perModelUsage.length > 0) {
        return perModelUsage.reduce(addTokenUsage, EMPTY_TOKEN_USAGE);
    }

    if (!message.usage) {
        return EMPTY_TOKEN_USAGE;
    }

    return {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadInputTokens: message.usage.cache_read_input_tokens,
        cacheCreationInputTokens: message.usage.cache_creation_input_tokens,
    };
}
