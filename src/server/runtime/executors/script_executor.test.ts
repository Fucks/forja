import {
    AgentCanceledError,
    AgentTimeoutError,
} from "@/integrations/agent_runtime/agent_errors.js";
import type { AgentEvent } from "@/integrations/agent_runtime/agent_runtime.js";
import { executeScriptNode } from "@/server/runtime/executors/script_executor.js";
import { ScriptFailedError } from "@/server/runtime/executors/script_failed_error.js";
import type { NodeExecutionContext } from "@/server/runtime/node_executors.js";
import { type ScriptConfig, scriptConfigSchema } from "@/shared/node_configs/script_config.js";
import { buildIssueSnapshot } from "@/test/executor_test_bed.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import { buildNodeExecutionContext } from "@/test/factories/node_execution_context_factory.js";
import { buildRunCredentials } from "@/test/factories/run_credentials_factory.js";
import { FakeAgentRuntime, type ScriptedExec } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const POSITION = { x: 0, y: 0 };
const ISSUE = buildIssueSnapshot(1);
const TEST_COMMAND = "npm test";
const OUTPUT_MAX_LINES = 200;
const EXTRA_LINES = 50;
const PASSING: ScriptedExec = { exitCode: 0, stdoutTail: "all passed" };
const FAILING: ScriptedExec = { exitCode: 1, stdoutTail: "1 failed", stderrTail: "erro" };
const NPM_CREDENTIAL_ID = "crd_npm";
const NPM_TOKEN = "npm_0123456789abcdef";
const MASK = "••••";
const ONE_MINUTE_MS = 60_000;

describe("executeScriptNode", () => {
    describe("onFailure", () => {
        it("fails with script_failed when the command exits with another code than 0", async () => {
            const { context } = buildScriptContext({ onFailure: "fail" }, FAILING);

            const executing = executeScriptNode(context);

            await expect(executing).rejects.toBeInstanceOf(ScriptFailedError);
            await expect(executing).rejects.toThrow("O comando terminou com código 1");
        });

        it("succeeds with passed false when it continues after a failing command", async () => {
            const { context } = buildScriptContext({ onFailure: "continue" }, FAILING);

            const result = await executeScriptNode(context);

            expect(result.outputs.result).toEqual({
                exitCode: 1,
                passed: false,
                stdout: "1 failed",
                stderr: "erro",
                durationMs: 0,
            });
        });

        it("succeeds with passed true when the command exits with 0", async () => {
            const { context } = buildScriptContext({ onFailure: "fail" }, PASSING);

            const result = await executeScriptNode(context);

            expect(result.outputs).toEqual({
                result: {
                    exitCode: 0,
                    passed: true,
                    stdout: "all passed",
                    stderr: "",
                    durationMs: 0,
                },
                output: "all passed",
            });
        });

        it("keeps a node saved before onFailure existed succeeding on a failing command", async () => {
            const script = createNodeOfType("script", "tests", POSITION);
            const config = scriptConfigSchema.parse({ command: TEST_COMMAND, workspace: "item" });
            const runtime = new FakeAgentRuntime({ clock: new FakeClock() });
            runtime.scriptExec(TEST_COMMAND, FAILING);
            const context = buildNodeExecutionContext(
                { ...script, config },
                { runtime, item: ISSUE },
            );

            const result = await executeScriptNode(context);

            expect(result.outputs.result).toMatchObject({ exitCode: 1, passed: false });
        });
    });

    describe("output", () => {
        it("keeps only the last 200 lines of stdout and stderr", async () => {
            const lines = Array.from(
                { length: OUTPUT_MAX_LINES + EXTRA_LINES },
                (_, index) => `linha ${index + 1}`,
            );
            const lastLines = lines.slice(-OUTPUT_MAX_LINES).join("\n");
            const { context } = buildScriptContext(
                {},
                { exitCode: 0, stdoutTail: lines.join("\n"), stderrTail: lines.join("\n") },
            );

            const result = await executeScriptNode(context);

            expect(result.outputs.result).toMatchObject({ stdout: lastLines, stderr: lastLines });
            expect(result.outputs.output).toBe(lastLines);
        });

        it("sends each output line of the command as a raw agent event", async () => {
            const events: AgentEvent[] = [];
            const { context } = buildScriptContext(
                {},
                { ...PASSING, outputLines: ["PASS a.test.ts", "PASS b.test.ts"] },
                { onAgentEvent: (event) => events.push(event) },
            );

            await executeScriptNode(context);

            expect(rawLinesOf(events)).toEqual(["PASS a.test.ts", "PASS b.test.ts"]);
        });

        it("measures how long the command took", async () => {
            const clock = new FakeClock();
            const { context } = buildScriptContext(
                {},
                { ...PASSING, durationMs: ONE_MINUTE_MS },
                { clock },
            );

            const executing = executeScriptNode(context);
            await untilTheCommandStarts();
            clock.advance(ONE_MINUTE_MS);

            const result = await executing;
            expect(result.outputs.result).toMatchObject({ durationMs: ONE_MINUTE_MS });
        });
    });

    describe("parseOutput", () => {
        it("reads the JSON of the last line into data", async () => {
            const { context } = buildScriptContext(
                { parseOutput: "lastLineJson" },
                { exitCode: 0, stdoutTail: 'Medindo...\n{"coverage": 81}\n' },
            );

            const result = await executeScriptNode(context);

            expect(result.outputs.result).toMatchObject({ data: { coverage: 81 } });
        });

        it("reads the whole stdout as JSON into data", async () => {
            const { context } = buildScriptContext(
                { parseOutput: "json" },
                { exitCode: 0, stdoutTail: '{\n  "files": 3\n}' },
            );

            const result = await executeScriptNode(context);

            expect(result.outputs.result).toMatchObject({ data: { files: 3 } });
        });

        it("leaves data out and logs it when the output is not valid JSON", async () => {
            const events: AgentEvent[] = [];
            const { context } = buildScriptContext(
                { parseOutput: "json" },
                { exitCode: 0, stdoutTail: "81%" },
                { onAgentEvent: (event) => events.push(event) },
            );

            const result = await executeScriptNode(context);

            expect(result.outputs.result).not.toHaveProperty("data");
            expect(systemMessagesOf(events)).toContain(
                "Saída não é JSON válido; `data` ficou vazio",
            );
        });
    });

    describe("command and environment", () => {
        it("renders the item title as a single literal argument", async () => {
            const { context, runtime } = buildScriptContext(
                { command: "echo {{item.title}}" },
                PASSING,
                { item: { ...ISSUE, title: "a'; touch /tmp/pwn #" } },
            );

            await executeScriptNode(context);

            expect(runtime.receivedExecs[0]?.command).toBe("echo 'a'\\''; touch /tmp/pwn #'");
        });

        it("runs the command with its env, working directory and shell", async () => {
            const { context, runtime } = buildScriptContext(
                {
                    shell: "sh",
                    workingDir: "web",
                    env: [{ name: "NODE_ENV", value: "test" }],
                },
                PASSING,
            );

            await executeScriptNode(context);

            const [received] = runtime.receivedExecs;
            expect(received).toMatchObject({ kind: "exec", cwd: "web", shell: "sh" });
            expect(received?.env).toMatchObject({ NODE_ENV: "test", FORJA_ITEM_ID: ISSUE.id });
        });
    });

    describe("runIn", () => {
        it("runs an isolated command in an ephemeral container without an item", async () => {
            const { context, runtime } = buildScriptContext({ runIn: "isolated" }, PASSING, {
                item: undefined,
            });

            const result = await executeScriptNode(context);

            expect(result.outputs.result).toMatchObject({ passed: true });
            expect(runtime.calls.map((call) => call.kind)).toEqual(["execHeadless"]);
        });

        it("runs an isolated command in the project's agent image unless it names one", async () => {
            const { context, runtime } = buildScriptContext({ runIn: "isolated" }, PASSING);
            const custom = buildScriptContext({ runIn: "isolated", image: "node:22" }, PASSING);

            await executeScriptNode(context);
            await executeScriptNode(custom.context);

            expect(runtime.headlessExecSpecs[0]?.image).toBe(context.settings.agentImage);
            expect(custom.runtime.headlessExecSpecs[0]?.image).toBe("node:22");
        });

        it("fails a command in the item workspace when there is no item", async () => {
            const { context } = buildScriptContext({ runIn: "item" }, PASSING, {
                item: undefined,
            });

            const executing = executeScriptNode(context);

            await expect(executing).rejects.toThrow(
                'Um nó com workspace "item" precisa de um item de trabalho',
            );
        });
    });

    describe("interruptions", () => {
        it("fails on timeout even when it continues after failures", async () => {
            const clock = new FakeClock();
            const { context } = buildScriptContext(
                { onFailure: "continue", timeoutMinutes: 1 },
                { ...PASSING, durationMs: 2 * ONE_MINUTE_MS },
                { clock },
            );

            const executing = executeScriptNode(context);
            await untilTheCommandStarts();
            clock.advance(ONE_MINUTE_MS);

            await expect(executing).rejects.toBeInstanceOf(AgentTimeoutError);
        });

        it("aborts the command when the NodeRun is canceled", async () => {
            const controller = new AbortController();
            const { context } = buildScriptContext(
                { onFailure: "continue" },
                { ...PASSING, durationMs: ONE_MINUTE_MS },
                { signal: controller.signal },
            );

            const executing = executeScriptNode(context);
            await untilTheCommandStarts();
            controller.abort();

            await expect(executing).rejects.toBeInstanceOf(AgentCanceledError);
        });
    });

    describe("credentials", () => {
        it("masks the credential value in the logged lines and in the result", async () => {
            const events: AgentEvent[] = [];
            const { context, runtime } = buildScriptContext(
                { env: [{ name: "NPM_TOKEN", credentialId: NPM_CREDENTIAL_ID }] },
                {
                    exitCode: 0,
                    stdoutTail: `token=${NPM_TOKEN}`,
                    stderrTail: `aviso ${NPM_TOKEN}`,
                    outputLines: [`token=${NPM_TOKEN}`],
                },
                {
                    credentials: buildRunCredentials({ [NPM_CREDENTIAL_ID]: NPM_TOKEN }),
                    onAgentEvent: (event) => events.push(event),
                },
            );

            const result = await executeScriptNode(context);

            expect(runtime.receivedExecs[0]?.env).toMatchObject({ NPM_TOKEN });
            expect(rawLinesOf(events)).toEqual([`token=${MASK}`]);
            expect(result.outputs.result).toMatchObject({
                stdout: `token=${MASK}`,
                stderr: `aviso ${MASK}`,
            });
            expect(JSON.stringify(result)).not.toContain(NPM_TOKEN);
        });
    });
});

// The fake runtime plays the scripted command on the fake clock of the context.
type ScriptContextOverrides = Omit<Partial<NodeExecutionContext>, "clock"> & { clock?: FakeClock };

interface ScriptTestSetup {
    context: NodeExecutionContext;
    runtime: FakeAgentRuntime;
}

function buildScriptContext(
    config: Partial<ScriptConfig>,
    execution: ScriptedExec,
    overrides: ScriptContextOverrides = {},
): ScriptTestSetup {
    const clock = overrides.clock ?? new FakeClock();
    const parsedConfig = scriptConfigSchema.parse({ command: TEST_COMMAND, ...config });
    const runtime = new FakeAgentRuntime({ clock });
    runtime.scriptExec(parsedConfig.command, execution);
    const script = createNodeOfType("script", "tests", POSITION);
    const context = buildNodeExecutionContext(
        { ...script, config: parsedConfig },
        { runtime, clock, item: ISSUE, ...overrides },
    );

    return { context, runtime };
}

// The environment is built asynchronously before the command starts.
function untilTheCommandStarts(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

function rawLinesOf(events: AgentEvent[]): string[] {
    return events.flatMap((event) => (event.kind === "raw" ? [event.line] : []));
}

function systemMessagesOf(events: AgentEvent[]): string[] {
    return events.flatMap((event) => (event.kind === "system" ? [event.message] : []));
}
