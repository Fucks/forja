import { PromptRenderError } from "@/engine/prompt_template.js";
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
import { mapAgentError, usageLimitResetAtOf } from "@/server/runtime/error_mapping.js";
import { CommandRenderError } from "@/server/runtime/executors/script_environment.js";
import { ScriptFailedError } from "@/server/runtime/executors/script_failed_error.js";

const RESET_AT = new Date("2026-01-01T15:00:00Z");

describe("mapAgentError", () => {
    it.each([
        [new UsageLimitError(RESET_AT), "usage_limit"],
        [new AgentTimeoutError("total"), "timeout_total"],
        [new AgentTimeoutError("idle"), "timeout_idle"],
        [new StructuredOutputError(), "structured_output"],
        [new AgentCanceledError(), "canceled"],
        [new WorkspaceError("Docker parado"), "workspace"],
        [new AgentRuntimeError("claude saiu com código 1"), "runtime"],
        [new PromptRenderError("item.number"), "runtime"],
        [new CommandRenderError("item.url"), "runtime"],
        [new ScriptFailedError(1), "script_failed"],
    ])("maps %s to the failure kind %s with its message", (error, kind) => {
        const mapped = mapAgentError(error);

        expect(mapped).toEqual({ kind, message: error.message });
    });

    it("maps a missing Claude credential to a workspace failure that is not retried", () => {
        const mapped = mapAgentError(new MissingCredentialError());

        expect(mapped).toEqual({
            kind: "workspace",
            message: "Configure uma credencial do Claude no projeto",
            isRetryable: false,
        });
    });

    it("shows a failed gh command with what gh wrote on stderr", () => {
        const error = new GitHubError(
            "Falha ao executar gh pr create",
            "GraphQL: Resource not accessible by personal access token (createPullRequest)",
        );

        expect(mapAgentError(error)).toEqual({
            kind: "runtime",
            message:
                "Falha ao executar gh pr create: GraphQL: Resource not accessible by personal " +
                "access token (createPullRequest)",
        });
    });

    it("shows a gh failure without stderr with its message alone", () => {
        const mapped = mapAgentError(new GitHubError("Resposta inesperada de gh pr view", ""));

        expect(mapped).toEqual({ kind: "runtime", message: "Resposta inesperada de gh pr view" });
    });

    it("hides the message of an unexpected error behind a generic one", () => {
        const mapped = mapAgentError(new TypeError("Cannot read properties of undefined"));

        expect(mapped).toEqual({ kind: "runtime", message: "Falha inesperada ao executar o nó" });
    });

    it("maps a thrown value that is not an error to a runtime failure", () => {
        const mapped = mapAgentError("boom");

        expect(mapped.kind).toBe("runtime");
    });
});

describe("usageLimitResetAtOf", () => {
    it("returns when the usage limit resets", () => {
        expect(usageLimitResetAtOf(new UsageLimitError(RESET_AT))).toEqual(RESET_AT);
    });

    it("returns nothing for other errors", () => {
        expect(usageLimitResetAtOf(new AgentRuntimeError("falhou"))).toBeUndefined();
    });
});
