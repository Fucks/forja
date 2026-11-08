import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RuntimeCall } from "@/test/fakes/fake_agent_runtime.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import type { ForjaEvent } from "@/shared/events.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import {
    buildIssueSnapshot,
    ExecutorTestBed,
    type JournalEntry,
    PROJECT_SYSTEM_PROMPT,
    peakOverlapOf,
    TEST_PROJECT_ID,
} from "@/test/executor_test_bed.js";

const ISSUE_2 = buildIssueSnapshot(2);
const FOUR_ISSUES = [buildIssueSnapshot(1), ISSUE_2, buildIssueSnapshot(3), buildIssueSnapshot(4)];
const DEV_PROMPT = "Implemente a issue";
const DEV_DURATION_MS = 60_000;
const TEN_MINUTES_MS = 10 * 60_000;
const LIMIT_RESET_AT = new Date("2026-01-01T00:20:00Z");
const RESUME_AT = new Date("2026-01-01T00:25:00Z");

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
            expect(developer.outputs).toEqual({ summary: "ok" });
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
