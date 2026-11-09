import {
    AgentCanceledError,
    AgentRuntimeError,
    AgentTimeoutError,
    StructuredOutputError,
    UsageLimitError,
    WorkspaceError,
} from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentEvent,
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
    ExecOptions,
    HeadlessSpec,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import {
    FakeAgentRuntime,
    type ScriptedError,
    type ScriptedStep,
} from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const START = new Date("2026-03-10T12:00:00Z");
const LONGER_THAN_ANY_SCRIPTED_STEP_MS = 60_000;
const SILENT_HOOKS: AgentRunHooks = { onEvent: () => undefined };

describe("FakeAgentRuntime", () => {
    describe("duration and result", () => {
        it("resolves a run only after the scripted duration has passed", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock, steps: [stepFor("tl", 30_000)] });

            const run = runtime.runHeadless(
                headlessSpec(),
                runRequest({ nodeRunId: "tl" }),
                SILENT_HOOKS,
            );
            clock.advance(29_999);
            const isPendingBeforeDuration = await isStillPending(run);
            clock.advance(1);

            expect(isPendingBeforeDuration).toBe(true);
            await expect(run).resolves.toMatchObject({ summary: "ok" });
        });

        it("returns summary ok, 1000/200 token usage and no commits by default", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock });

            const run = runtime.runHeadless(headlessSpec(), runRequest(), SILENT_HOOKS);
            clock.advance(1_000);

            await expect(run).resolves.toEqual({
                summary: "ok",
                commits: [],
                usage: {
                    inputTokens: 1_000,
                    outputTokens: 200,
                    cacheReadInputTokens: 0,
                    cacheCreationInputTokens: 0,
                },
                iterations: 1,
            });
        });

        it("merges the scripted result over the default result", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock }).script({
                match: {},
                durationMs: 10,
                result: { output: { approved: true }, commits: [{ sha: "abc123" }] },
            });

            const run = runtime.runHeadless(headlessSpec(), runRequest(), SILENT_HOOKS);
            clock.advance(10);

            await expect(run).resolves.toMatchObject({
                summary: "ok",
                output: { approved: true },
                commits: [{ sha: "abc123" }],
            });
        });

        it("uses the default duration when no step matches", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock, defaultDurationMs: 5_000 });

            const run = runtime.runHeadless(headlessSpec(), runRequest(), SILENT_HOOKS);
            clock.advance(4_999);
            const isPendingBeforeDuration = await isStillPending(run);
            clock.advance(1);

            expect(isPendingBeforeDuration).toBe(true);
            await expect(run).resolves.toMatchObject({ summary: "ok" });
        });
    });

    describe("step matching", () => {
        it("uses the first step whose criteria all match", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock })
                .script(resultStep({ nodeRunId: "tl", promptIncludes: "deploy" }, "wrong prompt"))
                .script(resultStep({ nodeRunId: "tl" }, "first match"))
                .script(resultStep({}, "later match"));

            const result = runAndFinish(clock, runtime, runRequest({ nodeRunId: "tl" }));

            await expect(result).resolves.toMatchObject({ summary: "first match" });
        });

        it("matches by prompt text and by work item", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock })
                .script(resultStep({ workItemId: "issue-7" }, "issue 7"))
                .script(resultStep({ promptIncludes: "review" }, "reviewer"));

            const byWorkItem = runAndFinish(clock, runtime, runRequest(), "issue-7");
            const byPrompt = runAndFinish(clock, runtime, runRequest({ prompt: "please review" }));

            await expect(byWorkItem).resolves.toMatchObject({ summary: "issue 7" });
            await expect(byPrompt).resolves.toMatchObject({ summary: "reviewer" });
        });

        it("stops matching a step after it was used the scripted number of times", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock })
                .script({ ...resultStep({}, "limited"), times: 2 })
                .script(resultStep({}, "fallback"));

            const summaries: string[] = [];
            for (let run = 0; run < 3; run++) {
                const result = await runAndFinish(clock, runtime, runRequest());
                summaries.push(result.summary);
            }

            expect(summaries).toEqual(["limited", "limited", "fallback"]);
        });
    });

    describe("events", () => {
        it("delivers scripted events in order, stamped with the fake clock time", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock }).script({
                match: {},
                durationMs: 3_000,
                events: [
                    { kind: "text", text: "lendo o código", iteration: 1 },
                    { kind: "tool_call", name: "Bash", args: "npm test", iteration: 1 },
                ],
            });
            const received: AgentEvent[] = [];

            const run = runtime.runHeadless(headlessSpec(), runRequest(), {
                onEvent: (event) => received.push(event),
            });
            clock.advance(3_000);
            await run;

            expect(received).toEqual([
                {
                    kind: "text",
                    text: "lendo o código",
                    iteration: 1,
                    at: new Date("2026-03-10T12:00:01Z"),
                },
                {
                    kind: "tool_call",
                    name: "Bash",
                    args: "npm test",
                    iteration: 1,
                    at: new Date("2026-03-10T12:00:02Z"),
                },
            ]);
        });
    });

    describe("errors", () => {
        it.each<[ScriptedError, new (...args: never[]) => Error]>([
            [{ type: "usage_limit" }, UsageLimitError],
            [{ type: "timeout", kind: "idle" }, AgentTimeoutError],
            [{ type: "structured_output" }, StructuredOutputError],
            [{ type: "runtime", message: "o agente travou" }, AgentRuntimeError],
            [{ type: "workspace", message: "Docker indisponível" }, WorkspaceError],
        ])("rejects a %o step with %O", async (error, errorClass) => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock }).script({
                match: {},
                durationMs: 10,
                error,
            });

            const run = runAndFinish(clock, runtime, runRequest());

            await expect(run).rejects.toBeInstanceOf(errorClass);
        });

        it("keeps the reset time of a usage limit and the kind of a timeout", async () => {
            const clock = new FakeClock(START);
            const resetAt = new Date("2026-03-10T17:00:00Z");
            const runtime = new FakeAgentRuntime({ clock })
                .script({
                    match: { nodeRunId: "limit" },
                    durationMs: 10,
                    error: { type: "usage_limit", resetAt },
                })
                .script({
                    match: { nodeRunId: "slow" },
                    durationMs: 10,
                    error: { type: "timeout", kind: "total" },
                });

            const limited = runAndFinish(clock, runtime, runRequest({ nodeRunId: "limit" }));
            const timedOut = runAndFinish(clock, runtime, runRequest({ nodeRunId: "slow" }));

            await expect(limited).rejects.toMatchObject({ resetAt });
            await expect(timedOut).rejects.toMatchObject({ kind: "total" });
        });
    });

    describe("cancellation", () => {
        it("rejects with AgentCanceledError as soon as the signal is aborted", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock, defaultDurationMs: 60_000 });
            const controller = new AbortController();

            const run = runtime.runHeadless(
                headlessSpec(),
                runRequest({ signal: controller.signal }),
                SILENT_HOOKS,
            );
            controller.abort();

            await expect(run).rejects.toBeInstanceOf(AgentCanceledError);
        });

        it("rejects with AgentCanceledError when the signal was already aborted", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock });

            const run = runtime.runHeadless(
                headlessSpec(),
                runRequest({ signal: AbortSignal.abort() }),
                SILENT_HOOKS,
            );

            await expect(run).rejects.toBeInstanceOf(AgentCanceledError);
        });

        it("stops delivering events once the run is canceled", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock }).script({
                match: {},
                durationMs: 2_000,
                events: [{ kind: "raw", line: "{}", iteration: 1 }],
            });
            const controller = new AbortController();
            const received: AgentEvent[] = [];

            const run = runtime.runHeadless(
                headlessSpec(),
                runRequest({ signal: controller.signal }),
                {
                    onEvent: (event) => received.push(event),
                },
            );
            controller.abort();
            await run.catch(() => undefined);
            clock.advance(2_000);

            expect(received).toEqual([]);
        });

        it("frees the concurrency slot of a canceled run", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock });
            const controller = new AbortController();
            const canceled = runtime.runHeadless(
                headlessSpec(),
                runRequest({ signal: controller.signal }),
                SILENT_HOOKS,
            );
            controller.abort();
            await canceled.catch(() => undefined);

            await runAndFinish(clock, runtime, runRequest());

            expect(runtime.peakConcurrentRuns()).toBe(1);
        });
    });

    describe("concurrency and call log", () => {
        it("reports the most runs that overlapped", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock })
                .script({ match: { nodeRunId: "long" }, durationMs: 3_000 })
                .script({ match: { nodeRunId: "short" }, durationMs: 1_000 });

            const runs = [
                runtime.runHeadless(
                    headlessSpec(),
                    runRequest({ nodeRunId: "long" }),
                    SILENT_HOOKS,
                ),
                runtime.runHeadless(
                    headlessSpec(),
                    runRequest({ nodeRunId: "short" }),
                    SILENT_HOOKS,
                ),
                runtime.runHeadless(
                    headlessSpec(),
                    runRequest({ nodeRunId: "short" }),
                    SILENT_HOOKS,
                ),
            ];
            clock.advance(1_000);
            await Promise.all(runs.slice(1));
            const afterShortRuns = runtime.runHeadless(
                headlessSpec(),
                runRequest({ nodeRunId: "short" }),
                SILENT_HOOKS,
            );
            clock.advance(2_000);
            await Promise.all([...runs, afterShortRuns]);

            expect(runtime.peakConcurrentRuns()).toBe(3);
        });

        it("records each call with its kind, node run, work item and time", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock, defaultDurationMs: 1_000 });

            const workspace = await runtime.openWorkspace(
                workspaceSpec("issue-7"),
                SILENT_HOOKS,
                neverAborted(),
            );
            const run = workspace.runAgent(runRequest({ nodeRunId: "dev" }), SILENT_HOOKS);
            clock.advance(1_000);
            await run;
            await workspace.exec("npm test", execOptions());
            await workspace.close();

            expect(runtime.calls).toEqual([
                { kind: "open", workItemId: "issue-7", at: START },
                { kind: "run", nodeRunId: "dev", workItemId: "issue-7", at: START },
                { kind: "exec", workItemId: "issue-7", at: new Date("2026-03-10T12:00:01Z") },
                { kind: "close", workItemId: "issue-7", at: new Date("2026-03-10T12:00:01Z") },
            ]);
        });

        it("records headless runs with their optional work item", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock });

            await runAndFinish(clock, runtime, runRequest({ nodeRunId: "triage" }), "issue-9");

            expect(runtime.calls).toEqual([
                { kind: "headless", nodeRunId: "triage", workItemId: "issue-9", at: START },
            ]);
        });
    });

    describe("workspaces", () => {
        it("lists open workspaces until they are closed", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock });

            const first = await runtime.openWorkspace(
                workspaceSpec("issue-1"),
                SILENT_HOOKS,
                neverAborted(),
            );
            const second = await runtime.openWorkspace(
                workspaceSpec("issue-2"),
                SILENT_HOOKS,
                neverAborted(),
            );
            await runtime.closeWorkspace(first.id);

            expect(await runtime.listOpenWorkspaces()).toEqual([
                { id: second.id, runId: "run-1", workItemId: "issue-2" },
            ]);
        });

        it("starts with the workspaces a previous process left open", async () => {
            const leftOpen = { id: "workspace-1", runId: "run-1", workItemId: "issue-1" };
            const runtime = new FakeAgentRuntime({
                clock: new FakeClock(START),
                openWorkspaces: [leftOpen],
            });

            const opened = await runtime.openWorkspace(
                workspaceSpec("issue-2"),
                SILENT_HOOKS,
                neverAborted(),
            );

            expect(await runtime.listOpenWorkspaces()).toEqual([
                leftOpen,
                { id: opened.id, runId: "run-1", workItemId: "issue-2" },
            ]);
        });

        it("announces the ready workspace as a system event", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock });
            const received: AgentEvent[] = [];

            await runtime.openWorkspace(
                workspaceSpec("issue-5"),
                { onEvent: (event) => received.push(event) },
                neverAborted(),
            );

            expect(received).toEqual([{ kind: "system", message: "workspace pronto", at: START }]);
        });

        it("refuses to open a workspace when the signal was already aborted", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock });

            const opening = runtime.openWorkspace(
                workspaceSpec("issue-6"),
                SILENT_HOOKS,
                AbortSignal.abort(),
            );

            await expect(opening).rejects.toBeInstanceOf(AgentCanceledError);
            expect(await runtime.listOpenWorkspaces()).toEqual([]);
        });

        it("gives each workspace the branch of its spec", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock });

            const workspace = await runtime.openWorkspace(
                workspaceSpec("issue-3"),
                SILENT_HOOKS,
                neverAborted(),
            );

            expect(workspace.branch).toBe("forja/issue-3");
        });

        it("returns exit code 0 from exec unless the command was scripted", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock }).scriptExec("npm run lint", {
                exitCode: 1,
                stdoutTail: "2 problems",
            });
            const workspace = await runtime.openWorkspace(
                workspaceSpec("issue-4"),
                SILENT_HOOKS,
                neverAborted(),
            );

            const tests = await workspace.exec("npm test", execOptions());
            const lint = await workspace.exec("npm run lint", execOptions());

            expect(tests).toEqual({ exitCode: 0, stdoutTail: "" });
            expect(lint).toEqual({ exitCode: 1, stdoutTail: "2 problems" });
        });

        it("keeps the spec files and the written files in memory, the latest content winning", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock });
            const workspace = await runtime.openWorkspace(
                { ...workspaceSpec("issue-5"), files: [{ path: "CLAUDE.md", content: "regras" }] },
                SILENT_HOOKS,
                neverAborted(),
            );

            await workspace.writeFiles([
                { path: "CLAUDE.md", content: "regras novas" },
                { path: ".forja/plan.md", content: "plano" },
            ]);

            expect(runtime.filesOf(workspace.id)).toEqual({
                "CLAUDE.md": "regras novas",
                ".forja/plan.md": "plano",
            });
        });

        it("roots each workspace in its own directory", async () => {
            const clock = new FakeClock(START);
            const runtime = new FakeAgentRuntime({ clock });

            const first = await runtime.openWorkspace(
                workspaceSpec("issue-6"),
                SILENT_HOOKS,
                neverAborted(),
            );
            const second = await runtime.openWorkspace(
                workspaceSpec("issue-7"),
                SILENT_HOOKS,
                neverAborted(),
            );

            expect(first.root).not.toBe(second.root);
        });
    });
});

function stepFor(nodeRunId: string, durationMs: number): ScriptedStep {
    return { match: { nodeRunId }, durationMs };
}

function resultStep(match: ScriptedStep["match"], summary: string): ScriptedStep {
    return { match, durationMs: 10, result: { summary } };
}

function runAndFinish(
    clock: FakeClock,
    runtime: FakeAgentRuntime,
    request: AgentRunRequest,
    workItemId?: string,
): Promise<AgentRunResult> {
    const run = runtime.runHeadless({ ...headlessSpec(), workItemId }, request, SILENT_HOOKS);
    clock.advance(LONGER_THAN_ANY_SCRIPTED_STEP_MS);
    return run;
}

async function isStillPending(promise: Promise<unknown>): Promise<boolean> {
    const pending = Symbol("pending");
    const realMacrotask = new Promise((resolve) => setTimeout(() => resolve(pending), 0));

    return (await Promise.race([promise, realMacrotask])) === pending;
}

function runRequest(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
    return {
        nodeRunId: "node-run-1",
        prompt: "implemente a issue",
        model: "claude-sonnet-5-5",
        effort: "medium",
        maxIterations: 1,
        idleTimeoutSeconds: 600,
        timeoutMs: 3_600_000,
        permissionMode: "bypassPermissions",
        env: {},
        signal: neverAborted(),
        ...overrides,
    };
}

function headlessSpec(): HeadlessSpec {
    return {
        projectId: "project-1",
        runId: "run-1",
        repoPath: "/repos/forja",
        baseBranch: "main",
        image: "forja/agent:latest",
        env: {},
        setupCommands: [],
    };
}

function workspaceSpec(workItemId: string): WorkspaceSpec {
    return {
        ...headlessSpec(),
        workItemId,
        branch: `forja/${workItemId}`,
        files: [],
    };
}

function execOptions(): ExecOptions {
    return { timeoutMs: 60_000, signal: neverAborted() };
}

function neverAborted(): AbortSignal {
    return new AbortController().signal;
}
