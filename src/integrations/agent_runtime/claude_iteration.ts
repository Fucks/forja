import type { AgentContainer } from "@/integrations/agent_runtime/agent_container.js";
import { AgentTimeoutError } from "@/integrations/agent_runtime/agent_errors.js";
import type { AgentRunHooks, AgentRunRequest } from "@/integrations/agent_runtime/agent_runtime.js";
import { buildClaudeArgs } from "@/integrations/agent_runtime/claude_command.js";
import type { ClaudeResult } from "@/integrations/agent_runtime/claude_result.js";
import {
    expandPromptCommands,
    type PromptCommandResult,
} from "@/integrations/agent_runtime/prompt_commands.js";
import type { RunDeadlines } from "@/integrations/agent_runtime/run_deadlines.js";
import { createStreamJsonParser } from "@/integrations/agent_runtime/stream_json_parser.js";
import type { Clock } from "@/lib/clock.js";

export interface ClaudeIterationInput {
    clock: Clock;
    container: AgentContainer;
    request: AgentRunRequest;
    hooks: AgentRunHooks;
    deadlines: RunDeadlines;
    iteration: number;
}

export interface ClaudeIteration {
    iteration: number;
    result?: ClaudeResult;
    exitCode: number;
    stderrTail: string;
    /** Every text the agent wrote, where the completion signal is looked for. */
    agentTexts: string[];
    lastAssistantText: string;
}

const PROMPT_COMMAND_TIMEOUT_MS = 60_000;
const TIMED_OUT_EXIT_CODE = 124;
const TIMED_OUT_OUTPUT = "tempo esgotado";

/** One `claude -p` in the container, the prompt on stdin and each stdout line parsed live. */
export async function runClaudeIteration(input: ClaudeIterationInput): Promise<ClaudeIteration> {
    const { clock, container, request, hooks, deadlines, iteration } = input;
    const prompt = await preparePrompt(input);
    const parser = createStreamJsonParser({ now: () => clock.now(), iteration });
    const agentTexts: string[] = [];

    function consumeLine(line: string): void {
        deadlines.restartIdleTimer();
        for (const event of parser.push(line)) {
            if (event.kind === "text") {
                agentTexts.push(event.text);
            }
            hooks.onEvent(event);
        }
    }

    deadlines.restartIdleTimer();
    const execution = await container.containers.exec(
        container.containerId,
        buildClaudeArgs(request, { iteration }),
        {
            env: agentEnvironment(container, request),
            stdin: prompt,
            timeoutMs: request.timeoutMs,
            signal: deadlines.signal,
            onStdoutLine: consumeLine,
            onStderrLine: () => deadlines.restartIdleTimer(),
        },
    );

    const result = parser.result();
    return {
        iteration,
        result,
        exitCode: execution.exitCode,
        stderrTail: execution.stderrTail,
        agentTexts: result?.text ? [...agentTexts, result.text] : agentTexts,
        lastAssistantText: parser.lastAssistantText(),
    };
}

async function preparePrompt(input: ClaudeIterationInput): Promise<string> {
    const prompt = withIterationNote(input.request, input.iteration);
    if (!input.request.expandPromptCommands) {
        return prompt;
    }

    return expandPromptCommands(prompt, (command) => runPromptCommand(input, command));
}

function withIterationNote(request: AgentRunRequest, iteration: number): string {
    if (iteration === 1) {
        return request.prompt;
    }

    const note = `Iteração ${iteration} de ${request.maxIterations}: continue a partir dos commits do branch`;
    return `${request.prompt}\n\n${note}`;
}

async function runPromptCommand(
    { container, request, deadlines }: ClaudeIterationInput,
    command: string,
): Promise<PromptCommandResult> {
    try {
        const execution = await container.containers.exec(
            container.containerId,
            ["sh", "-c", command],
            {
                env: agentEnvironment(container, request),
                timeoutMs: PROMPT_COMMAND_TIMEOUT_MS,
                signal: deadlines.signal,
            },
        );

        return { exitCode: execution.exitCode, stdoutTail: execution.stdoutTail };
    } catch (error) {
        if (error instanceof AgentTimeoutError) {
            return { exitCode: TIMED_OUT_EXIT_CODE, stdoutTail: TIMED_OUT_OUTPUT };
        }
        throw error;
    }
}

function agentEnvironment(
    container: AgentContainer,
    request: AgentRunRequest,
): Record<string, string> {
    return { ...container.env, ...request.env };
}
