import type { NodeRunError } from "@/engine/node_run_state.js";
import { PromptRenderError } from "@/engine/prompt_template.js";
import type { FailureKind } from "@/engine/retry_policy.js";
import {
    AgentCanceledError,
    AgentRuntimeError,
    AgentTimeoutError,
    StructuredOutputError,
    UsageLimitError,
    WorkspaceError,
} from "@/integrations/agent_runtime/agent_errors.js";

const UNEXPECTED_FAILURE: NodeRunError = {
    kind: "runtime",
    message: "Falha inesperada ao executar o nó",
};

export class UnsupportedNodeTypeError extends Error {
    constructor(readonly nodeType: string) {
        super(`Nós do tipo ${nodeType} ainda não podem ser executados`);
        this.name = "UnsupportedNodeTypeError";
    }
}

// Their messages are written for the user; anything else may carry internal details.
const RUNTIME_ERRORS_SHOWN_TO_USERS = [
    AgentRuntimeError,
    PromptRenderError,
    UnsupportedNodeTypeError,
] as const;

export function mapAgentError(error: unknown): NodeRunError {
    if (!(error instanceof Error)) {
        return UNEXPECTED_FAILURE;
    }

    const kind = failureKindOf(error);
    if (kind === undefined) {
        return UNEXPECTED_FAILURE;
    }

    return { kind, message: error.message };
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
