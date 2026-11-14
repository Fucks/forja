import type { AgentContainer } from "@/integrations/agent_runtime/agent_container.js";
import {
    AgentCanceledError,
    AgentRuntimeError,
    AgentTimeoutError,
    StructuredOutputError,
    UsageLimitError,
} from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentEvent,
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
} from "@/integrations/agent_runtime/agent_runtime.js";
import { createRunAgentInContainer } from "@/integrations/agent_runtime/run_agent_in_container.js";
import { parseUsageLimit } from "@/integrations/agent_runtime/usage_limit_parser.js";
import type { WorkspaceCommits } from "@/integrations/agent_runtime/workspace_commits.js";
import { buildAgentRunRequest } from "@/test/factories/agent_run_request_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeContainerManager, type ScriptedExec } from "@/test/fakes/fake_container_manager.js";
import {
    assistantTextLine,
    readStreamJsonFixture,
    resultLine,
} from "@/test/fixtures/stream_json_fixtures.js";

const NOW = new Date("2026-11-09T12:00:00Z");
const CONTAINER_ID = "c0ffee";
const LINE_DELAY_MS = 1_000;
const CLOCK_STEP_MS = 500;
const MAX_CLOCK_STEPS = 10_000;
const COMPLETION_SIGNAL = "<promise>COMPLETE</promise>";
const OUTPUT_SCHEMA = {
    type: "object",
    properties: { verdict: { type: "string", enum: ["approve", "request_changes"] } },
    required: ["verdict"],
};

class InMemoryCommits implements WorkspaceCommits {
    private shas = ["base"];

    add(sha: string): void {
        this.shas = [...this.shas, sha];
    }

    readHead(): Promise<string> {
        return Promise.resolve(this.shas.at(-1) ?? "");
    }

    listCommitsSince(sha: string): Promise<{ sha: string }[]> {
        const after = this.shas.slice(this.shas.indexOf(sha) + 1);
        return Promise.resolve(after.map((commitSha) => ({ sha: commitSha })));
    }
}

function isClaude(command: string[]): boolean {
    return command[0] === "claude";
}

function isShell(command: string[]): boolean {
    return command[0] === "sh";
}

function claudeExec(lines: string[], overrides: Partial<ScriptedExec> = {}): ScriptedExec {
    return { stdoutLines: lines, lineDelayMs: LINE_DELAY_MS, ...overrides };
}

function usageLine(inputTokens: number, text: string): string {
    return resultLine({
        result: text,
        usage: {
            input_tokens: inputTokens,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        },
    });
}

function expectedResetAt(limitMessage: string): Date | undefined {
    const usageLimit = parseUsageLimit(limitMessage, NOW);
    return usageLimit.isLimit ? usageLimit.resetAt : undefined;
}

async function settleWithClock<T>(clock: FakeClock, promise: Promise<T>): Promise<T> {
    let isSettled = false;
    const tracked = promise.finally(() => {
        isSettled = true;
    });
    tracked.catch(() => undefined);

    for (let step = 0; step < MAX_CLOCK_STEPS && !isSettled; step += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        clock.advance(CLOCK_STEP_MS);
    }

    return tracked;
}

function createHarness() {
    const clock = new FakeClock(NOW);
    const containers = new FakeContainerManager(clock);
    const events: AgentEvent[] = [];
    const hooks: AgentRunHooks = { onEvent: (event) => events.push(event) };
    const runAgent = createRunAgentInContainer({ clock });

    function start(
        request: AgentRunRequest,
        container: Partial<AgentContainer> = {},
    ): Promise<AgentRunResult> {
        const agentContainer = { containerId: CONTAINER_ID, containers, env: {}, ...container };
        return runAgent(agentContainer, request, hooks);
    }

    function run(
        request: AgentRunRequest,
        container: Partial<AgentContainer> = {},
    ): Promise<AgentRunResult> {
        return settleWithClock(clock, start(request, container));
    }

    function claudeExecs() {
        return containers.execs.filter((exec) => isClaude(exec.command));
    }

    return { clock, containers, events, hooks, start, run, claudeExecs };
}

describe("runAgentInContainer", () => {
    describe("one iteration", () => {
        it("runs claude in the container with the prompt on stdin and the merged environment", async () => {
            const harness = createHarness();
            harness.containers.whenExec(isClaude, claudeExec([resultLine()]));
            const request = buildAgentRunRequest({
                prompt: "Revise o README",
                env: { CLAUDE_CODE_OAUTH_TOKEN: "token" },
            });

            await harness.run(request, { env: { WORKSPACE: "sim" } });

            const [exec] = harness.claudeExecs();
            expect(exec?.containerId).toBe(CONTAINER_ID);
            expect(exec?.options.stdin).toBe("Revise o README");
            expect(exec?.command).not.toContain("Revise o README");
            expect(exec?.options.env).toEqual({
                WORKSPACE: "sim",
                CLAUDE_CODE_OAUTH_TOKEN: "token",
            });
        });

        it("delivers the events while the agent runs, in order", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec(readStreamJsonFixture("tool_calls.ndjson")),
            );

            const running = harness.start(buildAgentRunRequest());
            await new Promise((resolve) => setTimeout(resolve, 0));
            harness.clock.advance(5 * LINE_DELAY_MS);
            const eventsWhileRunning = harness.events.map((event) => event.kind);
            await settleWithClock(harness.clock, running);

            expect(eventsWhileRunning).toEqual(["system", "system", "text", "tool_call", "raw"]);
            expect(harness.events.map((event) => event.kind)).toEqual([
                ...eventsWhileRunning,
                "tool_call",
                "raw",
                "text",
            ]);
        });

        it("returns the summary, usage and session of the result", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec(readStreamJsonFixture("success_simple.ndjson")),
            );

            const result = await harness.run(buildAgentRunRequest());

            expect(result).toEqual({
                output: undefined,
                summary: "Pronto, o README foi revisado.",
                commits: [],
                usage: {
                    inputTokens: 120,
                    outputTokens: 45,
                    cacheReadInputTokens: 300,
                    cacheCreationInputTokens: 50,
                },
                sessionId: "sess-simple",
                iterations: 1,
                completionSignal: undefined,
            });
        });

        it("summarizes with the last assistant text when the result has none", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([assistantTextLine("Plano pronto."), resultLine({ result: "" })]),
            );

            const result = await harness.run(buildAgentRunRequest());

            expect(result.summary).toBe("Plano pronto.");
        });

        it("truncates the summary at 4 000 characters", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([resultLine({ result: "x".repeat(5_000) })]),
            );

            const result = await harness.run(buildAgentRunRequest());

            expect(result.summary).toHaveLength(4_000);
        });
    });

    describe("structured output", () => {
        it("returns the structured output that matches the schema", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec(readStreamJsonFixture("structured_output.ndjson")),
            );

            const result = await harness.run(buildAgentRunRequest({ outputSchema: OUTPUT_SCHEMA }));

            expect(result.output).toEqual({ verdict: "approve", issues: [] });
            expect(harness.claudeExecs()[0]?.command).toContain("--json-schema");
        });

        it("rejects a structured output that does not match the schema", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([resultLine({ structured_output: { verdict: "talvez" } })]),
            );

            const running = harness.run(buildAgentRunRequest({ outputSchema: OUTPUT_SCHEMA }));

            await expect(running).rejects.toBeInstanceOf(StructuredOutputError);
            await expect(running).rejects.toMatchObject({ raw: '{"verdict":"talvez"}' });
        });

        it("rejects a run without structured output, keeping the raw text", async () => {
            const harness = createHarness();
            harness.containers.whenExec(isClaude, claudeExec([resultLine({ result: "aprovado" })]));

            const running = harness.run(buildAgentRunRequest({ outputSchema: OUTPUT_SCHEMA }));

            await expect(running).rejects.toMatchObject({
                name: "StructuredOutputError",
                raw: "aprovado",
            });
        });
    });

    describe("structured output after a completion signal", () => {
        const request = buildAgentRunRequest({
            prompt: "Faça o spike",
            maxIterations: 30,
            completionSignal: COMPLETION_SIGNAL,
            outputSchema: OUTPUT_SCHEMA,
        });

        it("resumes the session with the schema when the signal comes before the last iteration", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([
                    assistantTextLine(`Relatório pronto ${COMPLETION_SIGNAL}`),
                    resultLine({ result: "Recomendação: Colyseus", session_id: "sess-spike" }),
                ]),
                claudeExec([
                    resultLine({
                        result: "",
                        session_id: "sess-spike",
                        structured_output: { verdict: "approve" },
                    }),
                ]),
            );

            const result = await harness.run(request);

            const [work, followUp] = harness.claudeExecs();
            expect(work?.command).not.toContain("--json-schema");
            expect(followUp?.command).toEqual(
                expect.arrayContaining(["--resume", "sess-spike", "--json-schema"]),
            );
            expect(followUp?.options.stdin).toContain("saída estruturada");
            expect(result.output).toEqual({ verdict: "approve" });
            expect(result.summary).toBe("Recomendação: Colyseus");
            expect(result.iterations).toBe(1);
            expect(result.completionSignal).toBe(COMPLETION_SIGNAL);
            expect(result.usage.inputTokens).toBe(20);
        });

        it("does not resume when the last iteration already got the schema", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([resultLine({ structured_output: { verdict: "approve" } })]),
            );

            const result = await harness.run(
                buildAgentRunRequest({ ...request, maxIterations: 1 }),
            );

            expect(harness.claudeExecs()).toHaveLength(1);
            expect(result.output).toEqual({ verdict: "approve" });
        });

        it("rejects a follow-up that still does not match the schema", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([assistantTextLine(COMPLETION_SIGNAL), resultLine()]),
                claudeExec([resultLine({ structured_output: { verdict: "talvez" } })]),
            );

            await expect(harness.run(request)).rejects.toBeInstanceOf(StructuredOutputError);
        });

        it("fails with the agent's message when the follow-up fails", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([assistantTextLine(COMPLETION_SIGNAL), resultLine()]),
                claudeExec([resultLine({ is_error: true, result: "sessão não encontrada" })]),
            );

            const running = harness.run(request);

            await expect(running).rejects.toBeInstanceOf(AgentRuntimeError);
            await expect(running).rejects.toMatchObject({ message: "sessão não encontrada" });
        });
    });

    describe("iterations", () => {
        it("stops at the iteration where the completion signal appears, summing the usage", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([usageLine(10, "Parte 1 feita")]),
                claudeExec([
                    assistantTextLine(`Tudo pronto ${COMPLETION_SIGNAL}`),
                    usageLine(20, "fim"),
                ]),
                claudeExec([usageLine(40, "não deveria rodar")]),
            );
            const request = buildAgentRunRequest({
                prompt: "Implemente",
                maxIterations: 3,
                completionSignal: COMPLETION_SIGNAL,
            });

            const result = await harness.run(request);

            expect(result.iterations).toBe(2);
            expect(result.completionSignal).toBe(COMPLETION_SIGNAL);
            expect(result.usage.inputTokens).toBe(30);
            expect(result.summary).toBe("fim");
            expect(harness.claudeExecs().map((exec) => exec.options.stdin)).toEqual([
                "Implemente",
                "Implemente\n\nIteração 2 de 3: continue a partir dos commits do branch",
            ]);
        });

        it("runs every iteration when the completion signal never appears", async () => {
            const harness = createHarness();
            harness.containers.whenExec(isClaude, claudeExec([usageLine(10, "ainda falta")]));
            const request = buildAgentRunRequest({
                maxIterations: 3,
                completionSignal: COMPLETION_SIGNAL,
            });

            const result = await harness.run(request);

            expect(result.iterations).toBe(3);
            expect(result.completionSignal).toBeUndefined();
            expect(result.usage.inputTokens).toBe(30);
        });

        it("tags the events with their iteration", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([assistantTextLine("oi"), resultLine()]),
            );

            await harness.run(
                buildAgentRunRequest({ maxIterations: 2, completionSignal: COMPLETION_SIGNAL }),
            );

            const textIterations = harness.events.flatMap((event) =>
                event.kind === "text" ? [event.iteration] : [],
            );
            expect(textIterations).toEqual([1, 2]);
        });

        it("without a completion signal, stops after the first iteration that succeeds", async () => {
            const harness = createHarness();
            harness.containers.whenExec(isClaude, claudeExec([resultLine()]));

            const result = await harness.run(buildAgentRunRequest({ maxIterations: 3 }));

            expect(result.iterations).toBe(1);
        });

        it("without a completion signal, repeats an iteration that hit the turn limit without commits", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec(readStreamJsonFixture("error_max_turns.ndjson")),
                claudeExec([resultLine()]),
            );

            const result = await harness.run(buildAgentRunRequest({ maxIterations: 3 }), {
                commits: new InMemoryCommits(),
            });

            expect(result.iterations).toBe(2);
        });

        it("without a completion signal, fails an iteration that hit the turn limit after committing", async () => {
            const harness = createHarness();
            const commits = new InMemoryCommits();
            harness.containers.whenExec(
                isClaude,
                claudeExec(readStreamJsonFixture("error_max_turns.ndjson")),
            );
            harness.hooks.onEvent = () => commits.add("abc123");

            const running = harness.run(buildAgentRunRequest({ maxIterations: 3 }), { commits });

            await expect(running).rejects.toThrow(
                new AgentRuntimeError("Reached maximum number of turns (5)"),
            );
        });

        it("fails when the last iteration hits the turn limit", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec(readStreamJsonFixture("error_max_turns.ndjson")),
            );

            const running = harness.run(
                buildAgentRunRequest({ maxIterations: 2, completionSignal: COMPLETION_SIGNAL }),
            );

            await expect(running).rejects.toBeInstanceOf(AgentRuntimeError);
            expect(harness.claudeExecs()).toHaveLength(2);
        });
    });

    describe("commits", () => {
        it("returns the commits made in the worktree during the run, oldest first", async () => {
            const harness = createHarness();
            const commits = new InMemoryCommits();
            harness.containers.whenExec(
                isClaude,
                claudeExec([assistantTextLine("commit"), resultLine()]),
            );
            let commitCount = 0;
            harness.hooks.onEvent = (event) => {
                if (event.kind === "text") {
                    commitCount += 1;
                    commits.add(`sha${commitCount}`);
                }
            };

            const result = await harness.run(
                buildAgentRunRequest({ maxIterations: 2, completionSignal: COMPLETION_SIGNAL }),
                { commits },
            );

            expect(result.commits).toEqual([{ sha: "sha1" }, { sha: "sha2" }]);
        });
    });

    describe("failures", () => {
        it("turns a usage limit message in the result into UsageLimitError with the reset time", async () => {
            const harness = createHarness();
            const limitMessage = "5-hour limit reached ∙ resets 3pm";
            harness.containers.whenExec(
                isClaude,
                claudeExec(
                    [
                        resultLine({
                            is_error: true,
                            subtype: "error_during_execution",
                            result: limitMessage,
                        }),
                    ],
                    {
                        exitCode: 1,
                    },
                ),
            );

            const running = harness.run(buildAgentRunRequest());

            await expect(running).rejects.toBeInstanceOf(UsageLimitError);
            await expect(running).rejects.toMatchObject({
                resetAt: expectedResetAt(limitMessage),
            });
        });

        it("turns a usage limit message in stderr into UsageLimitError", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([], {
                    exitCode: 1,
                    stderrTail: "Claude AI usage limit reached|1761072000",
                }),
            );

            const running = harness.run(buildAgentRunRequest());

            await expect(running).rejects.toMatchObject({
                name: "UsageLimitError",
                resetAt: new Date(1_761_072_000_000),
            });
        });

        it("reports a node over its budget", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([
                    resultLine({ is_error: true, subtype: "error_max_budget_usd", result: "" }),
                ]),
            );

            const running = harness.run(buildAgentRunRequest({ maxBudgetUsd: 1 }));

            await expect(running).rejects.toThrow(
                new AgentRuntimeError("orçamento do nó atingido"),
            );
        });

        it("reports any other failure with the agent's message", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([], { exitCode: 2, stderrTail: "Error: invalid model\n" }),
            );

            const running = harness.run(buildAgentRunRequest());

            await expect(running).rejects.toThrow(new AgentRuntimeError("Error: invalid model"));
        });

        it("reports an agent that ends without a result", async () => {
            const harness = createHarness();
            harness.containers.whenExec(isClaude, claudeExec([assistantTextLine("tchau")]));

            const running = harness.run(buildAgentRunRequest());

            await expect(running).rejects.toBeInstanceOf(AgentRuntimeError);
        });
    });

    describe("timeouts and cancel", () => {
        it("fails with an idle timeout when no line arrives for idleTimeoutSeconds", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([resultLine()], { lineDelayMs: 11_000 }),
            );

            const running = harness.run(buildAgentRunRequest({ idleTimeoutSeconds: 10 }));

            await expect(running).rejects.toThrow(new AgentTimeoutError("idle"));
        });

        it("keeps running while lines arrive within the idle timeout", async () => {
            const harness = createHarness();
            const lines = [
                ...Array.from({ length: 5 }, () => assistantTextLine("…")),
                resultLine(),
            ];
            harness.containers.whenExec(isClaude, claudeExec(lines, { lineDelayMs: 9_000 }));

            const result = await harness.run(buildAgentRunRequest({ idleTimeoutSeconds: 10 }));

            expect(result.iterations).toBe(1);
        });

        it("fails with a total timeout when the run takes longer than timeoutMs", async () => {
            const harness = createHarness();
            const lines = Array.from({ length: 30 }, () => assistantTextLine("…"));
            harness.containers.whenExec(isClaude, claudeExec(lines, { hangsAfterLines: true }));

            const running = harness.run(
                buildAgentRunRequest({ timeoutMs: 20_000, idleTimeoutSeconds: 10 }),
            );

            await expect(running).rejects.toThrow(new AgentTimeoutError("total"));
        });

        it("counts the total timeout across iterations", async () => {
            const harness = createHarness();
            harness.containers.whenExec(
                isClaude,
                claudeExec([resultLine()], { lineDelayMs: 4_000 }),
            );
            const request = buildAgentRunRequest({
                maxIterations: 5,
                completionSignal: COMPLETION_SIGNAL,
                timeoutMs: 20_000,
            });

            const running = harness.run(request);

            await expect(running).rejects.toThrow(new AgentTimeoutError("total"));
        });

        it("fails with AgentCanceledError when the user aborts", async () => {
            const harness = createHarness();
            const controller = new AbortController();
            harness.containers.whenExec(isClaude, claudeExec([], { hangsAfterLines: true }));

            const running = harness.start(buildAgentRunRequest({ signal: controller.signal }));
            await new Promise((resolve) => setTimeout(resolve, 0));
            controller.abort();

            await expect(running).rejects.toBeInstanceOf(AgentCanceledError);
        });
    });

    describe("prompt commands", () => {
        const PROMPT = "Último commit: !`git log -1`\n```sh\n!`git log -1`\n```";

        it("replaces the commands outside code blocks with their output in the workspace", async () => {
            const harness = createHarness();
            harness.containers.whenExec(isShell, { stdoutLines: ["abc123 primeiro"] });
            harness.containers.whenExec(isClaude, claudeExec([resultLine()]));

            await harness.run(buildAgentRunRequest({ prompt: PROMPT, expandPromptCommands: true }));

            const shellExecs = harness.containers.execs.filter((exec) => isShell(exec.command));
            expect(shellExecs.map((exec) => exec.command)).toEqual([["sh", "-c", "git log -1"]]);
            expect(harness.claudeExecs()[0]?.options.stdin).toBe(
                "Último commit: abc123 primeiro\n```sh\n!`git log -1`\n```",
            );
        });

        it("keeps the commands when the node does not expand them", async () => {
            const harness = createHarness();
            harness.containers.whenExec(isClaude, claudeExec([resultLine()]));

            await harness.run(
                buildAgentRunRequest({ prompt: PROMPT, expandPromptCommands: false }),
            );

            expect(harness.containers.execs.filter((exec) => isShell(exec.command))).toEqual([]);
            expect(harness.claudeExecs()[0]?.options.stdin).toBe(PROMPT);
        });
    });
});
