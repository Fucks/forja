import type { AgentEvent } from "@/integrations/agent_runtime/agent_runtime.js";
import type { NodeExecutionContext } from "@/server/runtime/node_executors.js";
import { executeScriptNode } from "@/server/runtime/executors/script_executor.js";
import { executeTriggerNode } from "@/server/runtime/executors/trigger_executor.js";
import { buildIssueSnapshot } from "@/test/executor_test_bed.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import { buildNodeExecutionContext } from "@/test/factories/node_execution_context_factory.js";
import { FakeAgentRuntime, type ScriptedExec } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const POSITION = { x: 0, y: 0 };
const ISSUE_1 = buildIssueSnapshot(1);
const ISSUE_2 = buildIssueSnapshot(2);
const TEST_COMMAND = "npm run test";
const STDOUT_TAIL_MAX_LINES = 200;

describe("deterministic executors", () => {
    describe("trigger", () => {
        it("outputs the item snapshots of the run", async () => {
            const trigger = createNodeOfType("trigger", "trigger", POSITION);
            const context = buildNodeExecutionContext(trigger, { runItems: [ISSUE_1, ISSUE_2] });

            const result = await executeTriggerNode(context);

            expect(result.outputs).toEqual({ items: [ISSUE_1, ISSUE_2] });
        });
    });

    describe("script", () => {
        it("succeeds with the exit code of a failing command as its result", async () => {
            const context = buildScriptContext({ exitCode: 1, stdoutTail: "1 failed" });

            const result = await executeScriptNode(context);

            expect(result.outputs).toEqual({ result: { exitCode: 1, stdoutTail: "1 failed" } });
        });

        it("sends each output line of the command as a raw agent event", async () => {
            const events: AgentEvent[] = [];
            const context = buildScriptContext(
                { exitCode: 0, stdoutTail: "", outputLines: ["PASS a.test.ts", "PASS b.test.ts"] },
                { onAgentEvent: (event) => events.push(event) },
            );

            await executeScriptNode(context);

            const rawLines = events.flatMap((event) => (event.kind === "raw" ? [event.line] : []));
            expect(rawLines).toEqual(["PASS a.test.ts", "PASS b.test.ts"]);
        });

        it("keeps only the last 200 lines of the stdout tail", async () => {
            const lines = Array.from({ length: 250 }, (_, index) => `linha ${index + 1}`);
            const context = buildScriptContext({ exitCode: 0, stdoutTail: lines.join("\n") });

            const result = await executeScriptNode(context);

            expect(result.outputs.result).toEqual({
                exitCode: 0,
                stdoutTail: lines.slice(-STDOUT_TAIL_MAX_LINES).join("\n"),
            });
        });
    });
});

function buildScriptContext(
    execution: ScriptedExec,
    overrides: Partial<NodeExecutionContext> = {},
): NodeExecutionContext {
    const runtime = new FakeAgentRuntime({ clock: new FakeClock() }).scriptExec(
        TEST_COMMAND,
        execution,
    );
    const script = createNodeOfType("script", "tests", POSITION);
    const node = { ...script, config: { ...script.config, command: TEST_COMMAND } };

    return buildNodeExecutionContext(node, { runtime, item: ISSUE_1, ...overrides });
}
