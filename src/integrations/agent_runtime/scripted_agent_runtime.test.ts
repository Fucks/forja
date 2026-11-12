import type {
    AgentEvent,
    AgentRunResult,
    AgentRuntime,
    HeadlessSpec,
    Workspace,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import { AgentCanceledError } from "@/integrations/agent_runtime/agent_errors.js";
import { jsonSchemaToZod } from "@/integrations/agent_runtime/output_schema.js";
import { createScriptedAgentRuntime } from "@/integrations/agent_runtime/scripted_agent_runtime.js";
import { buildAgentRunRequest } from "@/test/factories/agent_run_request_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const MIN_RUN_MS = 3_000;
const MAX_RUN_MS = 8_000;
const REVIEWER_OUTPUT_SCHEMA = {
    type: "object",
    properties: { approved: { type: "boolean" }, notes: { type: "string" } },
    required: ["approved", "notes"],
};

describe("ScriptedAgentRuntime", () => {
    describe("agent run", () => {
        it("finishes between 3 and 8 seconds after it starts", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const started = startHeadlessRun(runtime);

            clock.advance(MIN_RUN_MS - 1);
            await flushPromises();
            expect(started.result).toBeUndefined();

            clock.advance(MAX_RUN_MS - MIN_RUN_MS + 1);
            await flushPromises();
            expect(started.result).toBeDefined();
        });

        it("runs faster with a higher speed", async () => {
            const clock = new FakeClock();
            const speed = 50;
            const runtime = createScriptedAgentRuntime({ clock, speed });
            const started = startHeadlessRun(runtime);

            clock.advance(MAX_RUN_MS / speed);
            await flushPromises();

            expect(started.result).toBeDefined();
        });

        it("talks and calls Read, Grep, Edit and Bash with the tests", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const started = startHeadlessRun(runtime);

            clock.advance(MAX_RUN_MS);
            await flushPromises();

            const toolCalls = started.events.filter((event) => event.kind === "tool_call");
            const toolNames = new Set(toolCalls.map((event) => event.name));
            expect(started.events.some((event) => event.kind === "text")).toBe(true);
            expect([...toolNames]).toEqual(
                expect.arrayContaining(["Read", "Grep", "Edit", "Bash"]),
            );
            expect(toolCalls.find((event) => event.name === "Bash")?.args).toContain(
                "npm run test",
            );
        });

        it("spreads the events over the run, stamped with the clock", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const startedAt = clock.now().getTime();
            const started = startHeadlessRun(runtime);

            clock.advance(MAX_RUN_MS);
            await flushPromises();

            const eventTimes = started.events.map((event) => event.at.getTime());
            expect(eventTimes.every((at) => at > startedAt)).toBe(true);
            expect(eventTimes).toEqual([...eventTimes].sort((a, b) => a - b));
        });

        it("ends with the last text of the agent as its summary and some token usage", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const started = startHeadlessRun(runtime);

            clock.advance(MAX_RUN_MS);
            await flushPromises();

            const texts = started.events.filter((event) => event.kind === "text");
            expect(started.result?.summary).toBe(texts.at(-1)?.text);
            expect(started.result?.usage.inputTokens).toBeGreaterThan(0);
            expect(started.result?.usage.outputTokens).toBeGreaterThan(0);
            expect(started.result?.commits).toEqual([]);
        });

        it("plays the same events, duration and usage for the same NodeRun", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const first = startHeadlessRun(runtime, { nodeRunId: "nrn_same" });
            const second = startHeadlessRun(runtime, { nodeRunId: "nrn_same" });

            clock.advance(MAX_RUN_MS);
            await flushPromises();

            expect(second.events).toEqual(first.events);
            expect(second.result).toEqual(first.result);
        });

        it("plays a different run for another NodeRun", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const runs = ["nrn_a", "nrn_b", "nrn_c"].map((nodeRunId) =>
                startHeadlessRun(runtime, { nodeRunId }),
            );

            clock.advance(MAX_RUN_MS);
            await flushPromises();

            const usages = new Set(runs.map((run) => JSON.stringify(run.result?.usage)));
            expect(usages.size).toBe(runs.length);
        });

        it("outputs a value that passes the validation of the output schema", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const started = startHeadlessRun(runtime, { outputSchema: REVIEWER_OUTPUT_SCHEMA });

            clock.advance(MAX_RUN_MS);
            await flushPromises();

            const validation = jsonSchemaToZod(REVIEWER_OUTPUT_SCHEMA).safeParse(
                started.result?.output,
            );
            expect(validation.success).toBe(true);
        });

        it("outputs nothing structured without an output schema", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const started = startHeadlessRun(runtime);

            clock.advance(MAX_RUN_MS);
            await flushPromises();

            expect(started.result?.output).toBeUndefined();
        });

        it("reaches the completion signal in its first iteration", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const started = startHeadlessRun(runtime, {
                completionSignal: "<promise>COMPLETE</promise>",
                maxIterations: 5,
            });

            clock.advance(MAX_RUN_MS);
            await flushPromises();

            expect(started.result?.completionSignal).toBe("<promise>COMPLETE</promise>");
            expect(started.result?.iterations).toBe(1);
        });
    });

    describe("workspace", () => {
        it("opens a workspace on the branch of the item and says it is ready", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const events: AgentEvent[] = [];

            const workspace = await runtime.openWorkspace(
                workspaceSpec("itm_1"),
                { onEvent: (event) => events.push(event) },
                neverAborted(),
            );

            expect(workspace.branch).toBe("forja/item-1");
            expect(events).toEqual([
                { kind: "system", message: "workspace pronto", at: clock.now() },
            ]);
        });

        it("lists the open workspaces until they are closed", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const first = await openWorkspace(runtime, "itm_1");
            const second = await openWorkspace(runtime, "itm_2");

            await first.close();
            await runtime.closeWorkspace(second.id);

            expect(await runtime.listOpenWorkspaces()).toEqual([]);
        });

        it("tells which run and item each open workspace belongs to", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });

            const workspace = await openWorkspace(runtime, "itm_1");

            expect(await runtime.listOpenWorkspaces()).toEqual([
                { id: workspace.id, runId: "run_demo", workItemId: "itm_1" },
            ]);
        });

        it("runs agents in the workspace like headless ones", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const workspace = await openWorkspace(runtime, "itm_1");
            const running = workspace.runAgent(buildAgentRunRequest(), { onEvent: () => {} });

            clock.advance(MAX_RUN_MS);
            const result = await running;

            expect(result.summary).not.toBe("");
        });

        it("runs every command successfully without touching the disk", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const workspace = await openWorkspace(runtime, "itm_1");

            const result = await workspace.exec("npm run test", {
                timeoutMs: 60_000,
                signal: neverAborted(),
            });

            expect(result).toEqual({ exitCode: 0, stdoutTail: "" });
        });

        it("has an empty diff and accepts files without writing them", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const workspace = await openWorkspace(runtime, "itm_1");

            await workspace.writeFiles([{ path: "PLAN.md", content: "# Plano" }]);

            expect(await workspace.diff("main")).toBe("");
        });
    });

    describe("cancellation", () => {
        it("stops the agent run when its signal aborts", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const controller = new AbortController();
            const events: AgentEvent[] = [];
            const running = runtime.runHeadless(
                headlessSpec(),
                buildAgentRunRequest({ signal: controller.signal }),
                { onEvent: (event) => events.push(event) },
            );

            controller.abort();
            clock.advance(MAX_RUN_MS);

            await expect(running).rejects.toThrow(AgentCanceledError);
            expect(events).toEqual([]);
        });

        it("refuses to start with a signal already aborted", async () => {
            const clock = new FakeClock();
            const runtime = createScriptedAgentRuntime({ clock });
            const controller = new AbortController();
            controller.abort();

            const running = runtime.runHeadless(
                headlessSpec(),
                buildAgentRunRequest({ signal: controller.signal }),
                { onEvent: () => {} },
            );

            await expect(running).rejects.toThrow(AgentCanceledError);
        });
    });
});

interface StartedRun {
    events: AgentEvent[];
    result: AgentRunResult | undefined;
}

function startHeadlessRun(
    runtime: AgentRuntime,
    overrides: Parameters<typeof buildAgentRunRequest>[0] = {},
): StartedRun {
    const started: StartedRun = { events: [], result: undefined };
    const running = runtime.runHeadless(headlessSpec(), buildAgentRunRequest(overrides), {
        onEvent: (event) => started.events.push(event),
    });
    void recordResult(started, running);

    return started;
}

async function recordResult(started: StartedRun, running: Promise<AgentRunResult>): Promise<void> {
    started.result = await running;
}

function openWorkspace(runtime: AgentRuntime, workItemId: string): Promise<Workspace> {
    return runtime.openWorkspace(workspaceSpec(workItemId), { onEvent: () => {} }, neverAborted());
}

function workspaceSpec(workItemId: string): WorkspaceSpec {
    return {
        ...headlessSpec(),
        workItemId,
        branch: `forja/item-${workItemId.replace("itm_", "")}`,
        files: [],
    };
}

function neverAborted(): AbortSignal {
    return new AbortController().signal;
}

function headlessSpec(): HeadlessSpec {
    return {
        projectId: "prj_demo",
        runId: "run_demo",
        repoPath: "/repos/loja-de-cafe",
        baseBranch: "main",
        image: "forja-agent:latest",
        env: {},
        setupCommands: [],
    };
}

async function flushPromises(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
}
