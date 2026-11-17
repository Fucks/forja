import type { AgentEvent } from "@/integrations/agent_runtime/agent_runtime.js";
import { executeConditionNode } from "@/server/runtime/executors/condition_executor.js";
import { createOutputExecutor } from "@/server/runtime/executors/output_executor.js";
import type { NodeExecutionContext, NodeExecutionResult } from "@/server/runtime/node_executors.js";
import { executeScriptNode } from "@/server/runtime/executors/script_executor.js";
import { executeTriggerNode } from "@/server/runtime/executors/trigger_executor.js";
import type { Condition } from "@/shared/conditions.js";
import type { FlowEdge, FlowGraph, FlowNode, Port } from "@/shared/flow_graph.js";
import type { OutputConfig } from "@/shared/node_configs/output_config.js";
import { buildIssueSnapshot, ExecutorTestBed } from "@/test/executor_test_bed.js";
import { buildLoopFlow, connect, createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import {
    buildMapGroup,
    updateAgentConfig,
    updateGroup,
    updateNode,
} from "@/test/factories/flow_graph_variations.js";
import { buildNodeExecutionContext } from "@/test/factories/node_execution_context_factory.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildArtifactRecord, buildRunRecord } from "@/test/factories/run_record_factory.js";
import { buildGithubIssue } from "@/test/factories/work_item_factory.js";
import { FakeAgentRuntime, type ScriptedExec } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";
import { InMemoryRunRepository } from "@/test/fakes/in_memory_run_repository.js";

const POSITION = { x: 0, y: 0 };
const ISSUE_1 = buildIssueSnapshot(1);
const ISSUE_2 = buildIssueSnapshot(2);
const TEST_COMMAND = "npm run test";
const STDOUT_TAIL_MAX_LINES = 200;
const EXTRA_STDOUT_LINES = 50;
const REVIEW_PROMPT = "Revise a issue";
const APPROVED_REVIEW = { approved: true, notes: "ok" };
const PASSING_TESTS: ScriptedExec = { exitCode: 0, stdoutTail: "all passed" };
const FAILING_TESTS: ScriptedExec = { exitCode: 1, stdoutTail: "1 failed" };
const SCRIPT_LINES = ["PASS a.test.ts", "PASS b.test.ts"];
const WORKSPACE_READY_LOG_LINES = 1;
const LOG_PAGE_SIZE = 100;
const ONE_MINUTE = 1;
const TWO_MINUTES_MS = 120_000;
const ITEMS_GROUP_ID = "items";
const APPROVED: Condition = { op: "eq", path: "approved", value: true };
const REVIEW_OUTPUT_SCHEMA = {
    type: "object",
    properties: { approved: { type: "boolean" } },
    required: ["approved"],
};
const DEV_PROMPT_WITHOUT_NOTES = "Implemente a issue #{{item.number}}";
const TESTS_PASSED_AND_REVIEW_APPROVED: Condition = {
    op: "and",
    conditions: [
        { op: "eq", path: "revisar.result.approved", value: true },
        { op: "eq", path: "testes.result.exitCode", value: 0 },
    ],
};

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
            const context = buildScriptContext(FAILING_TESTS);

            const result = await executeScriptNode(context);

            expect(result.outputs).toEqual({ result: FAILING_TESTS });
        });

        it("sends each output line of the command as a raw agent event", async () => {
            const events: AgentEvent[] = [];
            const context = buildScriptContext(
                { ...PASSING_TESTS, outputLines: SCRIPT_LINES },
                { onAgentEvent: (event) => events.push(event) },
            );

            await executeScriptNode(context);

            const rawLines = events.flatMap((event) => (event.kind === "raw" ? [event.line] : []));
            expect(rawLines).toEqual(SCRIPT_LINES);
        });

        it("keeps only the last 200 lines of the stdout tail", async () => {
            const lines = Array.from(
                { length: STDOUT_TAIL_MAX_LINES + EXTRA_STDOUT_LINES },
                (_, index) => `linha ${index + 1}`,
            );
            const context = buildScriptContext({ exitCode: 0, stdoutTail: lines.join("\n") });

            const result = await executeScriptNode(context);

            expect(result.outputs.result).toEqual({
                exitCode: 0,
                stdoutTail: lines.slice(-STDOUT_TAIL_MAX_LINES).join("\n"),
            });
        });
    });

    describe("condition", () => {
        it("sends the input value to the true port when the condition holds", async () => {
            const context = buildConditionContext(APPROVED_REVIEW);

            const result = await executeConditionNode(context);

            expect(result.outputs).toEqual({ true: APPROVED_REVIEW });
        });

        it("sends the input value to the false port when the condition does not hold", async () => {
            const value = { approved: false, notes: "faltam testes" };
            const context = buildConditionContext(value);

            const result = await executeConditionNode(context);

            expect(result.outputs).toEqual({ false: value });
        });

        function buildConditionContext(value: unknown): NodeExecutionContext {
            const condition = createNodeOfType("condition", "approved", POSITION);
            const node = { ...condition, config: { condition: APPROVED } };

            return buildNodeExecutionContext(node, { inputs: { value } });
        }
    });

    describe("output", () => {
        const GITHUB_REPO = "Fucks/forja";
        const ISSUE_NUMBER = 1;
        const RUN_ID = "run-1";
        const OUTPUT_NODE_RUN_ID = "nr_output";
        const PR_URL = "https://github.com/Fucks/forja/pull/1007";

        let runs: InMemoryRunRepository;
        let github: FakeGitHubProvider;

        beforeEach(async () => {
            runs = new InMemoryRunRepository();
            github = new FakeGitHubProvider();
            github.addIssue(GITHUB_REPO, buildGithubIssue({ number: ISSUE_NUMBER }));
            await runs.createRun(buildRunRecord({ id: RUN_ID }));
        });

        function executeOutput(context: NodeExecutionContext): Promise<NodeExecutionResult> {
            const execute = createOutputExecutor({ runs, githubOf: () => Promise.resolve(github) });
            return execute(context);
        }

        function buildOutputContext(
            config: Partial<OutputConfig>,
            overrides: Partial<NodeExecutionContext> = {},
        ): NodeExecutionContext {
            const output = createNodeOfType("output", "output", POSITION);
            const node = { ...output, config: { ...output.config, ...config } };

            return buildNodeExecutionContext(node, {
                item: ISSUE_1,
                project: buildProject({ githubRepo: GITHUB_REPO }),
                run: buildRunRecord({ id: RUN_ID }),
                nodeRun: buildNodeRunState({
                    id: OUTPUT_NODE_RUN_ID,
                    runId: RUN_ID,
                    nodeId: "output",
                    workItemId: ISSUE_1.id,
                    status: "RUNNING",
                }),
                ...overrides,
            });
        }

        async function recordPullRequestOfRun(): Promise<void> {
            await runs.saveTransition({
                nodeRuns: [
                    buildNodeRunState({
                        id: "nr_open_pr",
                        runId: RUN_ID,
                        nodeId: "open_pr",
                        workItemId: ISSUE_1.id,
                        status: "SUCCEEDED",
                    }),
                ],
                artifacts: [
                    buildArtifactRecord({
                        nodeRunId: "nr_open_pr",
                        runId: RUN_ID,
                        name: "pr_url",
                        kind: "pr_url",
                        value: PR_URL,
                    }),
                ],
            });
        }

        function commentBodies(): string[] {
            return github.comments.map((comment) => comment.body);
        }

        it("records where the item moves as the item_outcome artifact", async () => {
            const context = buildOutputContext({ moveItemTo: "needs_human" });

            const result = await executeOutput(context);

            expect(result).toEqual({
                outputs: {},
                artifacts: [
                    { name: "item_outcome", kind: "json", value: { moveItemTo: "needs_human" } },
                ],
            });
        });

        it("does not comment on the issue unless commentOnIssue is on", async () => {
            await recordPullRequestOfRun();

            await executeOutput(buildOutputContext({ moveItemTo: "done" }));

            expect(github.comments).toEqual([]);
        });

        it("comments on the issue with the pull request the run opened", async () => {
            await recordPullRequestOfRun();

            await executeOutput(buildOutputContext({ moveItemTo: "done", commentOnIssue: true }));

            expect(github.comments).toEqual([
                {
                    repo: GITHUB_REPO,
                    issueNumber: ISSUE_NUMBER,
                    body: `Forja: run ${RUN_ID} concluída — PR #1007 aberto.`,
                },
            ]);
        });

        it("comments that the item needs human review and why", async () => {
            const context = buildOutputContext(
                { moveItemTo: "needs_human", commentOnIssue: true },
                { inputs: { item: { approved: false, notes: "faltam testes" } } },
            );

            await executeOutput(context);

            expect(commentBodies()).toEqual([
                `Forja: run ${RUN_ID} concluída — item precisa de revisão humana (faltam testes).`,
            ]);
        });

        it("comments with the summary of the checks that failed", async () => {
            const failedEvidence = {
                checksPassed: false,
                failureSummary: "npm run test falhou em 2 testes",
                body: "",
            };
            const context = buildOutputContext(
                { moveItemTo: "needs_human", commentOnIssue: true },
                { inputs: { evidence: failedEvidence } },
            );

            await executeOutput(context);

            expect(commentBodies()).toEqual([
                `Forja: run ${RUN_ID} concluída — item precisa de revisão humana ` +
                    "(npm run test falhou em 2 testes).",
            ]);
        });

        it("comments only that the run finished when there is no pull request", async () => {
            await executeOutput(buildOutputContext({ commentOnIssue: true }));

            expect(commentBodies()).toEqual([`Forja: run ${RUN_ID} concluída.`]);
        });

        it("comments once per run, even when the output runs again", async () => {
            await runs.saveTransition({
                nodeRuns: [
                    buildNodeRunState({
                        id: "nr_output_before",
                        runId: RUN_ID,
                        nodeId: "output",
                        workItemId: ISSUE_1.id,
                        status: "SUCCEEDED",
                    }),
                ],
            });

            await executeOutput(buildOutputContext({ commentOnIssue: true }));

            expect(github.comments).toEqual([]);
        });

        it("does not comment for an item without an issue", async () => {
            const localItem = { ...ISSUE_1, number: undefined, url: undefined };

            await executeOutput(buildOutputContext({ commentOnIssue: true }, { item: localItem }));

            expect(github.comments).toEqual([]);
        });
    });

    describe("in a run", () => {
        let bed: ExecutorTestBed;

        beforeEach(() => {
            bed = new ExecutorTestBed([ISSUE_1]);
            bed.runtime.script({
                match: { promptIncludes: REVIEW_PROMPT },
                durationMs: 1_000,
                result: { output: APPROVED_REVIEW },
            });
        });

        afterEach(() => {
            bed.close();
        });

        async function runToTheEnd(graph: FlowGraph): Promise<string> {
            const started = await bed.startRun(await bed.publishFlow(graph));
            await bed.runUntilFinished(started.id);

            return started.id;
        }

        it("finishes a script that exits with 1 as SUCCEEDED with its exit code", async () => {
            bed.runtime.scriptExec(TEST_COMMAND, FAILING_TESTS);

            const runId = await runToTheEnd(buildRunnableLoopFlow());

            const tests = await bed.findNodeRun(runId, "tests");
            expect(tests.status).toBe("SUCCEEDED");
            expect(tests.outputs).toEqual({ result: FAILING_TESTS });
        });

        it("fails a script that runs past its timeout with timeout_total", async () => {
            bed.runtime.scriptExec(TEST_COMMAND, { ...PASSING_TESTS, durationMs: TWO_MINUTES_MS });

            const runId = await runToTheEnd(
                withTestsTimeoutMinutes(buildRunnableLoopFlow(), ONE_MINUTE),
            );

            const tests = await bed.findNodeRun(runId, "tests");
            expect(tests.status).toBe("FAILED");
            expect(tests.error?.kind).toBe("timeout_total");
        });

        it("logs the workspace opening and each script line", async () => {
            bed.runtime.scriptExec(TEST_COMMAND, { ...PASSING_TESTS, outputLines: SCRIPT_LINES });

            const runId = await runToTheEnd(buildTestsOnlyFlow());

            const tests = await bed.findNodeRun(runId, "tests");
            const log = await bed.logs.read(tests.id, { limit: LOG_PAGE_SIZE });
            const scriptLines = log.events.flatMap((event) =>
                event.kind === "raw" ? [event.line] : [],
            );
            expect(log.total).toBe(WORKSPACE_READY_LOG_LINES + SCRIPT_LINES.length);
            expect(scriptLines).toEqual(SCRIPT_LINES);
        });

        it("runs the branch the condition chose and skips the other", async () => {
            const runId = await runToTheEnd(buildReviewDecisionFlow());

            expect((await bed.findNodeRun(runId, "done")).status).toBe("SUCCEEDED");
            expect((await bed.findNodeRun(runId, "needs_human")).status).toBe("SKIPPED");
        });

        it("saves the item_outcome artifact of the output node", async () => {
            const runId = await runToTheEnd(buildReviewDecisionFlow());

            const done = await bed.findNodeRun(runId, "done");
            const artifacts = await bed.runs.listArtifacts(done.id);
            expect(artifacts).toContainEqual(
                expect.objectContaining({
                    name: "item_outcome",
                    kind: "json",
                    value: { moveItemTo: "done" },
                }),
            );
        });

        it("repeats the loop while the tests fail and leaves it when they pass", async () => {
            bed.runtime.scriptExec(TEST_COMMAND, FAILING_TESTS, PASSING_TESTS);
            const graph = withLoopUntil(buildRunnableLoopFlow(), TESTS_PASSED_AND_REVIEW_APPROVED);

            const runId = await runToTheEnd(graph);

            const testsResults = (await bed.nodeRunsOf(runId, "tests")).map(
                (nodeRun) => nodeRun.outputs?.result,
            );
            expect(testsResults).toEqual([FAILING_TESTS, PASSING_TESTS]);
            expect((await bed.findRun(runId)).status).toBe("SUCCEEDED");
        });
    });
});

// The notes of the review only exist from the second iteration on, so the first Dev could not
// render a prompt that reads them.
function buildRunnableLoopFlow(): FlowGraph {
    return updateAgentConfig(buildLoopFlow(), "dev", { prompt: DEV_PROMPT_WITHOUT_NOTES });
}

// trigger → source → per item: tests
function buildTestsOnlyFlow(): FlowGraph {
    const tests = createNodeOfType("script", "tests", POSITION);

    return buildPerItemFlow(
        [{ ...tests, config: { ...tests.config, command: TEST_COMMAND } }],
        [connect(["source", "items"], ["tests", "item"])],
    );
}

// trigger → source → per item: review → check(approved?) → true: done; false: needs_human
// The outputs take the item of their map, so they only receive the decision.
function buildReviewDecisionFlow(): FlowGraph {
    const review = createNodeOfType("agent", "review", POSITION);
    const check = createNodeOfType("condition", "check", POSITION);
    const done = createNodeOfType("output", "done", POSITION);
    const needsHuman = createNodeOfType("output", "needs_human", POSITION);

    return buildPerItemFlow(
        [
            {
                ...review,
                config: {
                    ...review.config,
                    prompt: `${REVIEW_PROMPT} #{{item.number}}`,
                    outputSchema: REVIEW_OUTPUT_SCHEMA,
                },
            },
            { ...check, config: { condition: APPROVED } },
            { ...done, inputs: [decisionPort("approved")] },
            {
                ...needsHuman,
                inputs: [decisionPort("rejected")],
                config: { ...needsHuman.config, moveItemTo: "needs_human" },
            },
        ],
        [
            connect(["source", "items"], ["review", "item"]),
            connect(["review", "result"], ["check", "value"]),
            connect(["check", "true"], ["done", "approved"]),
            connect(["check", "false"], ["needs_human", "rejected"]),
        ],
    );
}

function buildPerItemFlow(itemNodes: FlowNode[], itemEdges: FlowEdge[]): FlowGraph {
    return {
        schemaVersion: 2,
        nodes: [
            createNodeOfType("trigger", "trigger", POSITION),
            createNodeOfType("source", "source", POSITION),
            ...itemNodes.map((node) => ({ ...node, parentGroupId: ITEMS_GROUP_ID })),
        ],
        edges: [connect(["trigger", "items"], ["source", "trigger"]), ...itemEdges],
        groups: [buildMapGroup(ITEMS_GROUP_ID)],
    };
}

function decisionPort(name: string): Port {
    return { name, type: "any", required: true };
}

function withLoopUntil(graph: FlowGraph, until: Condition): FlowGraph {
    return updateGroup(graph, "review_loop", (group) =>
        group.kind === "loop" ? { ...group, config: { ...group.config, until } } : group,
    );
}

function withTestsTimeoutMinutes(graph: FlowGraph, timeoutMinutes: number): FlowGraph {
    return updateNode(graph, "tests", (node) =>
        node.type === "script" ? { ...node, config: { ...node.config, timeoutMinutes } } : node,
    );
}

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
