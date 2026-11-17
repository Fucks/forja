import type { NodeRunState } from "@/engine/node_run_state.js";
import type { AgentRunRequest } from "@/integrations/agent_runtime/agent_runtime.js";
import type { RuntimeCall } from "@/test/fakes/fake_agent_runtime.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import { InvalidRunSnapshotError } from "@/server/runtime/stored_snapshot.js";
import type { ForjaEvent, NodeRunStatusName } from "@/shared/events.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { updateAgentConfig } from "@/test/factories/flow_graph_variations.js";
import {
    buildIssueSnapshot,
    ExecutorTestBed,
    type JournalEntry,
    PROJECT_SYSTEM_PROMPT,
    peakOverlapOf,
    TEST_CLAUDE_API_KEY,
    TEST_GITHUB_REPO,
    TEST_PROJECT_ID,
} from "@/test/executor_test_bed.js";
import { buildGithubIssue } from "@/test/factories/work_item_factory.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";

const ISSUE_2 = buildIssueSnapshot(2);
const FOUR_ISSUES = [buildIssueSnapshot(1), ISSUE_2, buildIssueSnapshot(3), buildIssueSnapshot(4)];
const DEV_PROMPT = "Implemente a issue";
const DEV_DURATION_MS = 60_000;
const TEN_MINUTES_MS = 10 * 60_000;
const LIMIT_RESET_AT = new Date("2026-01-01T00:20:00Z");
const RESUME_AT = new Date("2026-01-01T00:25:00Z");
const AGENT_TEXTS = ["Lendo a issue", "Escrevendo o teste", "Pronto"];
// Short enough for every event to land within one announcement window.
const AGENT_EVENTS_DURATION_MS = 200;
const LOG_PAGE_SIZE = 100;
const CLAUDE_OAUTH_TOKEN = "sk-ant-oat01-abcdefghijklmnopqrstuvwxyz-c3d4";
const GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";

describe("executor", () => {
    let bed: ExecutorTestBed;
    let flowId: string;

    beforeEach(async () => {
        bed = new ExecutorTestBed(FOUR_ISSUES);
        flowId = await bed.publishFlow(buildCanonicalFlow());
    });

    afterEach(() => {
        bed.close();
    });

    function scriptDevsLasting(durationMs: number): void {
        bed.runtime.script({ match: { promptIncludes: DEV_PROMPT }, durationMs });
    }

    function callsOf(kind: RuntimeCall["kind"]): RuntimeCall[] {
        return bed.runtime.calls.filter((call) => call.kind === kind);
    }

    async function runUntilSomeDevIsRunning(runId: string): Promise<void> {
        await bed.advanceUntil(async () =>
            (await bed.nodeRunsOf(runId, "dev")).some((nodeRun) => nodeRun.status === "RUNNING"),
        );
    }

    describe("canonical flow", () => {
        it("runs the 4 items to SUCCEEDED with at most 3 Devs and 1 Reviewer at a time", async () => {
            scriptDevsLasting(DEV_DURATION_MS);
            const started = await bed.startRun(flowId);

            const finished = await bed.runUntilFinished(started.id);

            expect(finished.status).toBe("SUCCEEDED");
            expect(peakOverlapOf(await bed.nodeRunsOf(started.id, "dev"))).toBe(3);
            expect(peakOverlapOf(await bed.nodeRunsOf(started.id, "reviewer"))).toBe(1);
        });

        it("keeps the run active until it finishes", async () => {
            const started = await bed.startRun(flowId);
            const activeWhileRunning = bed.executor.activeRunIds();

            await bed.runUntilFinished(started.id);

            expect(activeWhileRunning).toEqual([started.id]);
            expect(bed.executor.activeRunIds()).toEqual([]);
        });

        it("records the inputs and outputs of each NodeRun", async () => {
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const developer = await bed.findNodeRun(started.id, "dev");
            expect(developer.inputs).toMatchObject({ spec: "ok" });
            expect(developer.outputs).toEqual({ result: { commits: 0 }, summary: "ok" });
        });

        it("reports how many commits an agent without output schema made", async () => {
            bed.runtime.script({
                match: { promptIncludes: DEV_PROMPT },
                durationMs: DEV_DURATION_MS,
                result: { commits: [{ sha: "a1b2c3d" }, { sha: "e4f5a6b" }] },
            });
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const developer = await bed.findNodeRun(started.id, "dev");
            expect(developer.outputs).toMatchObject({ result: { commits: 2 } });
        });
    });

    describe("workspaces", () => {
        it("opens one workspace per item once and closes it when the item finishes", async () => {
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const itemIds = FOUR_ISSUES.map((item) => item.id);
            expect(workItemIdsOf(callsOf("open")).sort()).toEqual(itemIds);
            expect(workItemIdsOf(callsOf("close")).sort()).toEqual(itemIds);
            await expect(bed.runtime.listOpenWorkspaces()).resolves.toEqual([]);
        });

        it("runs the agents with workspace none headless", async () => {
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const techLeadIds = (await bed.nodeRunsOf(started.id, "tl")).map(({ id }) => id);
            expect(nodeRunIdsOf(callsOf("headless")).sort()).toEqual(techLeadIds.sort());
        });

        it("works on the items a source picked during the run and closes their workspaces", async () => {
            const github = new FakeGitHubProvider();
            github.addIssue(
                TEST_GITHUB_REPO,
                buildGithubIssue({ number: 5, labels: ["Sandcastle"] }),
            );
            const githubBed = new ExecutorTestBed([], { github });
            const githubFlowId = await githubBed.publishFlow(buildCanonicalFlow());
            const started = await githubBed.startRun(githubFlowId);

            const finished = await githubBed.runUntilFinished(started.id);

            const developers = await githubBed.nodeRunsOf(started.id, "dev");
            expect(finished.status).toBe("SUCCEEDED");
            expect(developers.map((developer) => developer.status)).toEqual(["SUCCEEDED"]);
            await expect(githubBed.runtime.listOpenWorkspaces()).resolves.toEqual([]);
            githubBed.close();
        });
    });

    describe("data context", () => {
        it("renders {{nodes.tl.summary}} in the prompt of the Dev with the summary of the TL", async () => {
            const graph = updateAgentConfig(buildCanonicalFlow(), "dev", {
                prompt: `${DEV_PROMPT} seguindo: {{nodes.tl.summary}}`,
            });
            const dataFlowId = await bed.publishFlow(graph);
            bed.runtime.script({
                match: { promptIncludes: "Escreva a especificação" },
                durationMs: DEV_DURATION_MS,
                result: { summary: "Especificação escrita pelo TL" },
            });
            const started = await bed.startRun(dataFlowId);

            await bed.runUntilFinished(started.id);

            const devPrompts = bed.runtime.requests
                .map((request) => request.prompt)
                .filter((prompt) => prompt.includes(DEV_PROMPT));
            expect(devPrompts).not.toEqual([]);
            expect(
                devPrompts.every((prompt) => prompt.includes("Especificação escrita pelo TL")),
            ).toBe(true);
        });
    });

    describe("credentials", () => {
        function devRequests(): AgentRunRequest[] {
            return bed.runtime.requests.filter((request) => request.prompt.includes(DEV_PROMPT));
        }

        it("runs every agent with the Claude credential of the project", async () => {
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const envs = bed.runtime.requests.map((request) => request.env);
            expect(envs.length).toBeGreaterThan(0);
            envs.forEach((env) => expect(env).toEqual({ ANTHROPIC_API_KEY: TEST_CLAUDE_API_KEY }));
        });

        it("runs a node with its own OAuth token and without the project's API key", async () => {
            const oauthToken = await bed.credentials.create({
                name: "Assinatura",
                kind: "claude_oauth_token",
                value: CLAUDE_OAUTH_TOKEN,
            });
            const oauthFlow = updateAgentConfig(buildCanonicalFlow(), "dev", {
                credentialId: oauthToken.id,
            });
            const started = await bed.startRun(await bed.publishFlow(oauthFlow));

            await bed.runUntilFinished(started.id);

            const envs = devRequests().map((request) => request.env);
            expect(envs).toHaveLength(FOUR_ISSUES.length);
            envs.forEach((env) =>
                expect(env).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: CLAUDE_OAUTH_TOKEN }),
            );
        });

        it("passes the GitHub token of the project to the workspaces and the agents", async () => {
            const githubToken = await bed.credentials.create({
                name: "GitHub",
                kind: "github_token",
                value: GITHUB_TOKEN,
            });
            await bed.changeProjectSettings({ githubCredentialId: githubToken.id });
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const githubEnv = { GH_TOKEN: GITHUB_TOKEN, GITHUB_TOKEN: GITHUB_TOKEN };
            expect(bed.runtime.openedSpecs).toHaveLength(FOUR_ISSUES.length);
            expect(devRequests()).toHaveLength(FOUR_ISSUES.length);
            bed.runtime.openedSpecs.forEach((spec) => expect(spec.env).toEqual(githubEnv));
            devRequests().forEach((request) => expect(request.env).toMatchObject(githubEnv));
        });

        it("fails an agent without a Claude credential, with no retry and no workspace", async () => {
            await bed.changeProjectSettings({ defaultCredentialId: null });
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const techLeads = await bed.nodeRunsOf(started.id, "tl");
            expect(techLeads.map((nodeRun) => nodeRun.error)).toEqual(
                FOUR_ISSUES.map(() => ({
                    kind: "workspace",
                    message: "Configure uma credencial do Claude no projeto",
                    isRetryable: false,
                })),
            );
            expect(callsOf("headless")).toEqual([]);
            expect(callsOf("open")).toEqual([]);
        });

        it("masks the Claude credential the agent prints in its log", async () => {
            bed.runtime.script({
                match: { workItemId: ISSUE_2.id, promptIncludes: DEV_PROMPT },
                durationMs: AGENT_EVENTS_DURATION_MS,
                events: [{ kind: "text", text: `chave ${TEST_CLAUDE_API_KEY}`, iteration: 1 }],
            });
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const dev = await bed.findNodeRun(
                started.id,
                "dev",
                (nodeRun) => nodeRun.workItemId === ISSUE_2.id,
            );
            const log = await bed.logs.read(dev.id, { limit: LOG_PAGE_SIZE });
            expect(JSON.stringify(log.events)).not.toContain(TEST_CLAUDE_API_KEY);
        });
    });

    describe("prompt", () => {
        it("sends the rendered prompt followed by the project conventions", async () => {
            await bed.useProjectSystemPrompt(PROJECT_SYSTEM_PROMPT);
            const runHeadless = vi.spyOn(bed.runtime, "runHeadless");
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const prompts = runHeadless.mock.calls.map(([, request]) => request.prompt);
            expect(prompts).toContain(
                "Escreva a especificação da issue #2 (Issue 2):\nCorpo da issue 2" +
                    `\n\n## Convenções do projeto\n\n${PROJECT_SYSTEM_PROMPT}`,
            );
        });
        it("passes the turn limit, the budget and the prompt commands option of the node", async () => {
            const limitedFlow = updateAgentConfig(buildCanonicalFlow(), "tl", {
                maxTurns: 30,
                maxBudgetUsd: 2,
                expandPromptCommands: false,
            });
            const limitedFlowId = await bed.publishFlow(limitedFlow);
            const runHeadless = vi.spyOn(bed.runtime, "runHeadless");
            const started = await bed.startRun(limitedFlowId);

            await bed.runUntilFinished(started.id);

            const [, request] = runHeadless.mock.calls[0] ?? [];
            expect(request).toMatchObject({
                maxTurns: 30,
                maxBudgetUsd: 2,
                expandPromptCommands: false,
            });
        });
    });

    describe("persistence and events", () => {
        it("saves every transition before publishing its event", async () => {
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            expect(bed.publishedEventsOf("node_run.updated").length).toBeGreaterThan(0);
            expect(eventsPublishedBeforeTheirSave(bed.journal)).toEqual([]);
        });

        it("announces the run from created to finished", async () => {
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const lifecycle = bed.journal
                .filter((entry) => entry.kind === "published")
                .map((entry) => entry.event.type)
                .filter((type) => type.startsWith("run."));
            expect(lifecycle).toEqual(["run.created", "run.started", "run.finished"]);
        });

        it("writes the agent events to the NodeRun log and announces their seq range", async () => {
            bed.runtime.script({
                match: { workItemId: ISSUE_2.id, promptIncludes: DEV_PROMPT },
                durationMs: AGENT_EVENTS_DURATION_MS,
                events: AGENT_TEXTS.map((text) => ({ kind: "text", text, iteration: 1 })),
            });
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const dev = await bed.findNodeRun(
                started.id,
                "dev",
                (nodeRun) => nodeRun.workItemId === ISSUE_2.id,
            );
            const log = await bed.logs.read(dev.id, { limit: LOG_PAGE_SIZE });
            const agentTexts = log.events
                .filter((event) => event.kind === "text")
                .map((event) => event.text);
            const announcedRanges = bed
                .publishedEventsOf("log.appended")
                .filter((event) => event.type === "log.appended" && event.nodeRunId === dev.id);
            expect(agentTexts).toEqual(AGENT_TEXTS);
            // The first line is the workspace being ready, announced before the agent starts.
            expect(announcedRanges).toEqual([
                expect.objectContaining({ runId: started.id, fromSeq: 1, toSeq: 1 }),
                expect.objectContaining({ runId: started.id, fromSeq: 2, toSeq: 4 }),
            ]);
        });

        it("announces the progress of the map groups", async () => {
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            expect(bed.publishedEventsOf("group.progress")).toContainEqual(
                expect.objectContaining({ groupId: "develop", succeeded: 4 }),
            );
        });
    });

    describe("pause by the user", () => {
        it("starts nothing new while paused and continues when resumed", async () => {
            scriptDevsLasting(DEV_DURATION_MS);
            const started = await bed.startRun(flowId);
            await runUntilSomeDevIsRunning(started.id);

            await bed.executor.pauseRun(started.id);
            const pausedAt = bed.clock.now();
            await bed.advanceBy(TEN_MINUTES_MS);
            const whilePaused = await bed.findRun(started.id);
            const startedWhilePaused = (await bed.runs.listNodeRuns(started.id)).filter((nodeRun) =>
                startedAfter(nodeRun, pausedAt),
            );
            await bed.executor.resumeRun(started.id);

            expect(whilePaused).toMatchObject({ status: "PAUSED", pauseReason: "user" });
            expect(startedWhilePaused).toEqual([]);
            await expect(bed.runUntilFinished(started.id)).resolves.toMatchObject({
                status: "SUCCEEDED",
            });
        });
    });

    describe("usage limit", () => {
        beforeEach(() => {
            bed.runtime.script({
                match: { promptIncludes: DEV_PROMPT, workItemId: ISSUE_2.id },
                durationMs: DEV_DURATION_MS,
                error: { type: "usage_limit", resetAt: LIMIT_RESET_AT },
                times: 1,
            });
        });

        it("pauses the run until 5 minutes after the limit resets", async () => {
            const started = await bed.startRun(flowId);

            await bed.advanceUntil(async () => (await bed.findRun(started.id)).status === "PAUSED");

            await expect(bed.findRun(started.id)).resolves.toMatchObject({
                pauseReason: "usage_limit",
                resumeAt: RESUME_AT,
            });
            expect(bed.publishedEventsOf("usage.limit_reached")).toEqual([
                {
                    type: "usage.limit_reached",
                    projectId: TEST_PROJECT_ID,
                    runId: started.id,
                    resetAt: LIMIT_RESET_AT.toISOString(),
                },
            ]);
        });

        it("resumes at resumeAt and finishes the run", async () => {
            const started = await bed.startRun(flowId);

            const finished = await bed.runUntilFinished(started.id);

            const developersOfIssue2 = (await bed.nodeRunsOf(started.id, "dev")).filter(
                (nodeRun) => nodeRun.workItemId === ISSUE_2.id,
            );
            expect(finished.status).toBe("SUCCEEDED");
            expect(bed.publishedEventsOf("usage.limit_reset")).toHaveLength(1);
            expect(developersOfIssue2).toEqual([
                expect.objectContaining({ status: "SUCCEEDED", attempt: 1 }),
            ]);
            const startTimesMs = developersOfIssue2.map((nodeRun) => nodeRun.startedAt?.getTime());
            expect(startTimesMs.every((startMs = 0) => startMs >= RESUME_AT.getTime())).toBe(true);
        });
    });

    describe("cancel", () => {
        it("aborts the running agents, closes the workspaces and ends CANCELED", async () => {
            scriptDevsLasting(DEV_DURATION_MS);
            const started = await bed.startRun(flowId);
            await runUntilSomeDevIsRunning(started.id);

            await bed.executor.cancelRun(started.id);
            const finished = await bed.runUntilFinished(started.id);

            const developers = await bed.nodeRunsOf(started.id, "dev");
            expect(finished.status).toBe("CANCELED");
            expect(developers.map((nodeRun) => nodeRun.status)).not.toContain("SUCCEEDED");
            expect(developers.map((nodeRun) => nodeRun.error?.kind)).toContain("canceled");
            await expect(bed.runtime.listOpenWorkspaces()).resolves.toEqual([]);
        });

        it("cancels one NodeRun of a map, failing only its item", async () => {
            scriptDevsLasting(DEV_DURATION_MS);
            const started = await bed.startRun(flowId);
            await runUntilSomeDevIsRunning(started.id);
            const runningDeveloper = await bed.findNodeRun(
                started.id,
                "dev",
                (nodeRun) => nodeRun.status === "RUNNING",
            );

            await bed.executor.cancelNodeRun(runningDeveloper.id);
            const finished = await bed.runUntilFinished(started.id);

            expect(finished.status).toBe("SUCCEEDED");
            expect(finished.failedItemIds).toEqual([runningDeveloper.workItemId]);
            await expect(bed.runs.getNodeRun(runningDeveloper.id)).resolves.toMatchObject({
                status: "CANCELED",
            });
        });
    });

    describe("resume after a server restart", () => {
        async function crashWithTwoDevsRunning(runId: string): Promise<string[]> {
            await bed.advanceUntil(async () => (await runningDeveloperIds(runId)).length === 2);

            return runningDeveloperIds(runId);
        }

        async function runningDeveloperIds(runId: string): Promise<string[]> {
            return (await bed.nodeRunsOf(runId, "dev"))
                .filter((nodeRun) => nodeRun.status === "RUNNING")
                .map((nodeRun) => nodeRun.id);
        }

        async function resumeFromStoredSnapshot(
            restarted: ExecutorTestBed,
            runId: string,
        ): Promise<void> {
            const run = await restarted.findRun(runId);
            await restarted.executor.resumeFromSnapshot(
                run,
                await restarted.runs.getSnapshot(runId),
            );
        }

        it("runs the interrupted Devs again with the same attempt and finishes the run", async () => {
            scriptDevsLasting(DEV_DURATION_MS);
            const started = await bed.startRun(flowId);
            const interruptedIds = await crashWithTwoDevsRunning(started.id);
            const restarted = await bed.restartServer();

            await resumeFromStoredSnapshot(restarted, started.id);
            const finished = await restarted.runUntilFinished(started.id);

            const interrupted = (await restarted.nodeRunsOf(started.id, "dev")).filter((nodeRun) =>
                interruptedIds.includes(nodeRun.id),
            );
            expect(finished.status).toBe("SUCCEEDED");
            expect(interrupted).toEqual([
                expect.objectContaining({ status: "SUCCEEDED", attempt: 1 }),
                expect.objectContaining({ status: "SUCCEEDED", attempt: 1 }),
            ]);
            expect(nodeRunIdsSavedAs(restarted.journal, "INTERRUPTED").sort()).toEqual(
                interruptedIds.sort(),
            );
        });

        it("takes the resumed run as its own active run", async () => {
            const started = await bed.startRun(flowId);
            await runUntilSomeDevIsRunning(started.id);
            const restarted = await bed.restartServer();

            await resumeFromStoredSnapshot(restarted, started.id);

            expect(restarted.executor.activeRunIds()).toEqual([started.id]);
        });

        it("refuses a snapshot that is not the run's", async () => {
            const started = await bed.startRun(flowId);
            const restarted = await bed.restartServer();
            const run = await restarted.findRun(started.id);

            await expect(
                restarted.executor.resumeFromSnapshot(run, { run: { id: "run_other" } }),
            ).rejects.toBeInstanceOf(InvalidRunSnapshotError);
            expect(restarted.executor.activeRunIds()).toEqual([]);
        });
    });

    describe("errors", () => {
        it("refuses to start a flow that has no published version", async () => {
            const draftOnly = await bed.flows.create(TEST_PROJECT_ID, { name: "Rascunho" });

            await expect(
                bed.executor.startRun({
                    projectId: TEST_PROJECT_ID,
                    flowId: draftOnly.id,
                    itemIds: [],
                }),
            ).rejects.toBeInstanceOf(DomainValidationError);
        });

        it("refuses to pause a run that is not in progress", async () => {
            await expect(bed.executor.pauseRun("run_missing")).rejects.toBeInstanceOf(
                NotFoundError,
            );
        });

        it("fails the NodeRun with the runtime error the agent reported", async () => {
            bed.runtime.script({
                match: { promptIncludes: DEV_PROMPT, workItemId: ISSUE_2.id },
                durationMs: DEV_DURATION_MS,
                error: { type: "runtime", message: "claude saiu com código 1" },
            });
            const started = await bed.startRun(flowId);

            await bed.runUntilFinished(started.id);

            const failedDevelopers = (await bed.nodeRunsOf(started.id, "dev")).filter(
                (nodeRun) => nodeRun.status === "FAILED",
            );
            expect(failedDevelopers.map((nodeRun) => nodeRun.error)).toContainEqual({
                kind: "runtime",
                message: "claude saiu com código 1",
            });
        });
    });
});

function workItemIdsOf(calls: RuntimeCall[]): (string | undefined)[] {
    return calls.map((call) => call.workItemId);
}

function nodeRunIdsOf(calls: RuntimeCall[]): (string | undefined)[] {
    return calls.map((call) => call.nodeRunId);
}

function nodeRunIdsSavedAs(journal: JournalEntry[], status: NodeRunStatusName): string[] {
    return journal
        .flatMap((entry) => (entry.kind === "saved" ? entry.nodeRuns : []))
        .filter((nodeRun) => nodeRun.status === status)
        .map((nodeRun) => nodeRun.id);
}

function startedAfter(nodeRun: NodeRunState, moment: Date): boolean {
    return nodeRun.startedAt !== undefined && nodeRun.startedAt.getTime() > moment.getTime();
}

// Describes each published event that had no matching save before it.
function eventsPublishedBeforeTheirSave(journal: JournalEntry[]): string[] {
    return journal.flatMap((entry, index) => {
        if (entry.kind !== "published" || isSavedBefore(journal.slice(0, index), entry.event)) {
            return [];
        }

        return [`${entry.event.type} at position ${index}`];
    });
}

function isSavedBefore(earlierEntries: JournalEntry[], event: ForjaEvent): boolean {
    switch (event.type) {
        case "node_run.updated":
            return earlierEntries.some(
                (entry) =>
                    entry.kind === "saved" &&
                    entry.nodeRuns.some(
                        (nodeRun) =>
                            nodeRun.id === event.nodeRunId && nodeRun.status === event.status,
                    ),
            );
        case "run.started":
        case "run.finished":
            return earlierEntries.some(
                (entry) => entry.kind === "saved" && entry.runStatus === event.status,
            );
        default:
            return true;
    }
}
