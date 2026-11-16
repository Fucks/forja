import type { NodeRunError } from "@/engine/node_run_state.js";
import { PromptRenderError } from "@/engine/prompt_template.js";
import type { FailureKind } from "@/engine/retry_policy.js";
import { MissingCredentialError } from "@/integrations/agent_runtime/agent_env.js";
import {
    AgentCanceledError,
    AgentRuntimeError,
    AgentTimeoutError,
    StructuredOutputError,
    UsageLimitError,
    WorkspaceError,
} from "@/integrations/agent_runtime/agent_errors.js";
import { GitHubError } from "@/integrations/github/github_provider.js";
import { UnsupportedNodeTypeError } from "@/server/runtime/unsupported_node_type_error.js";

const GITHUB_STDERR_MAX_CHARS = 500;

const UNEXPECTED_FAILURE: NodeRunError = {
    kind: "runtime",
    message: "Falha inesperada ao executar o nó",
};

// Their messages are written for the user; anything else may carry internal details.
const RUNTIME_ERRORS_SHOWN_TO_USERS = [
    AgentRuntimeError,
    PromptRenderError,
    UnsupportedNodeTypeError,
    GitHubError,
] as const;

export function mapAgentError(error: unknown): NodeRunError {
    if (!(error instanceof Error)) {
        return UNEXPECTED_FAILURE;
    }

    const kind = failureKindOf(error);
    if (kind === undefined) {
        return UNEXPECTED_FAILURE;
    }

    // The credential is still missing on the next attempt, until someone configures it.
    if (error instanceof MissingCredentialError) {
        return { kind, message: error.message, isRetryable: false };
    }

    return { kind, message: messageOf(error) };
}

// What `gh` wrote on stderr is the reason the user needs ("Resource not accessible…").
function messageOf(error: Error): string {
    if (!(error instanceof GitHubError) || error.stderr === "") {
        return error.message;
    }

    return `${error.message}: ${error.stderr.slice(-GITHUB_STDERR_MAX_CHARS)}`;
}

export function usageLimitResetAtOf(error: unknown): Date | undefined {
    return error instanceof UsageLimitError ? error.resetAt : undefined;
}

function failureKindOf(error: Error): FailureKind | undefined {
    if (error instanceof UsageLimitError) {
        return "usage_limit";
    }
    if (error instanceof AgentTimeoutError) {
        return error.kind === "total" ? "timeout_total" : "timeout_idle";
    }
    if (error instanceof StructuredOutputError) {
        return "structured_output";
    }
    if (error instanceof AgentCanceledError) {
        return "canceled";
    }
    if (error instanceof WorkspaceError) {
        return "workspace";
    }
    if (RUNTIME_ERRORS_SHOWN_TO_USERS.some((ErrorClass) => error instanceof ErrorClass)) {
        return "runtime";
    }

    return undefined;
}
