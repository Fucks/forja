import type { WorkspaceSpec } from "@/integrations/agent_runtime/agent_runtime.js";
import { type RecoveryReport, recoverRuns } from "@/server/runtime/recovery.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildRunRecord } from "@/test/factories/run_record_factory.js";
import { buildIssueSnapshot, ExecutorTestBed, TEST_PROJECT_ID } from "@/test/executor_test_bed.js";

const ISSUE_2 = buildIssueSnapshot(2);
const FOUR_ISSUES = [buildIssueSnapshot(1), ISSUE_2, buildIssueSnapshot(3), buildIssueSnapshot(4)];
const DEV_PROMPT = "Implemente a issue";
const DEV_DURATION_MS = 60_000;
const LIMIT_RESET_AT = new Date("2026-01-01T00:20:00Z");
const RESUME_AT = new Date("2026-01-01T00:25:00Z");
const AFTER_RESUME_AT = new Date("2026-01-01T01:00:00Z");
const RUN_STATE_LOST = "estado perdido no reinício";
const NEVER_ABORTED = new AbortController().signal;
const SILENT_HOOKS = { onEvent: () => undefined };

describe("recoverRuns", () => {
    let bed: ExecutorTestBed;
    let flowId: string;
    let logLines: string[];

    beforeEach(async () => {
        bed = new ExecutorTestBed(FOUR_ISSUES);
        flowId = await bed.publishFlow(buildCanonicalFlow());
        logLines = [];
    });

    afterEach(() => {
        bed.close();
    });

    function recoverOn(restarted: ExecutorTestBed): Promise<RecoveryReport> {
        return recoverRuns({
            runs: restarted.runs,
            executor: restarted.executor,
            runtime: restarted.runtime,
            clock: restarted.clock,
            log: (message) => logLines.push(message),
        });
    }

    async function crashWithTwoDevsRunning(runId: string): Promise<string[]> {
        bed.runtime.script({ match: { promptIncludes: DEV_PROMPT }, durationMs: DEV_DURATION_MS });
        await bed.advanceUntil(async () => (await runningDeveloperIds(runId)).length === 2);

        return runningDeveloperIds(runId);
    }

    async function runningDeveloperIds(runId: string): Promise<string[]> {
        return (await bed.nodeRunsOf(runId, "dev"))
            .filter((nodeRun) => nodeRun.status === "RUNNING")
            .map((nodeRun) => nodeRun.id);
    }

    async function pauseByUsageLimit(): Promise<string> {
        bed.runtime.script({
            match: { promptIncludes: DEV_PROMPT, workItemId: ISSUE_2.id },
            durationMs: DEV_DURATION_MS,
            error: { type: "usage_limit", resetAt: LIMIT_RESET_AT },
            times: 1,
        });
        const started = await bed.startRun(flowId);
        await bed.advanceUntil(async () => (await bed.findRun(started.id)).status === "PAUSED");

        return started.id;
    }

    describe("a run that was running", () => {
        it("reports the run resumed and its running NodeRuns interrupted", async () => {
            const started = await bed.startRun(flowId);
            const interruptedIds = await crashWithTwoDevsRunning(started.id);
            const restarted = await bed.restartServer();

            const report = await recoverOn(restarted);

            expect(report.resumed).toEqual([started.id]);
            expect([...report.interruptedNodeRuns].sort()).toEqual([...interruptedIds].sort());
            expect(report.stillPaused).toEqual([]);
            expect(report.failed).toEqual([]);
        });

        it("starts the interrupted Devs again with the same attempt and finishes", async () => {
            const started = await bed.startRun(flowId);
            const interruptedIds = await crashWithTwoDevsRunning(started.id);
            const restarted = await bed.restartServer();

            await recoverOn(restarted);
            const finished = await restarted.runUntilFinished(started.id);

            const interrupted = (await restarted.nodeRunsOf(started.id, "dev")).filter((nodeRun) =>
                interruptedIds.includes(nodeRun.id),
            );
            expect(finished.status).toBe("SUCCEEDED");
            expect(interrupted.map(({ status, attempt }) => ({ status, attempt }))).toEqual([
                { status: "SUCCEEDED", attempt: 1 },
                { status: "SUCCEEDED", attempt: 1 },
            ]);
        });

        it("runs each NodeRun only once after the recovery", async () => {
            const started = await bed.startRun(flowId);
            await crashWithTwoDevsRunning(started.id);
            const restarted = await bed.restartServer();

            await recoverOn(restarted);
            await restarted.runUntilFinished(started.id);

            const agentRunIds = restarted.runtime.calls
                .filter((call) => call.kind === "run" || call.kind === "headless")
                .map((call) => call.nodeRunId);
            expect(agentRunIds).toEqual([...new Set(agentRunIds)]);
        });
    });

    describe("a run paused by the usage limit", () => {
        it("stays paused and resumes at resumeAt", async () => {
            const runId = await pauseByUsageLimit();
            const restarted = await bed.restartServer();

            const report = await recoverOn(restarted);
            const whilePaused = await restarted.findRun(runId);
            await restarted.advanceUntil(() =>
                Promise.resolve(restarted.clock.now().getTime() >= RESUME_AT.getTime()),
            );
            const atResumeAt = await restarted.findRun(runId);

            expect(report.stillPaused).toEqual([runId]);
            expect(whilePaused).toMatchObject({ status: "PAUSED", resumeAt: RESUME_AT });
            expect(atResumeAt.status).toBe("RUNNING");
            await expect(restarted.runUntilFinished(runId)).resolves.toMatchObject({
                status: "SUCCEEDED",
            });
        });

        it("resumes right away when resumeAt passed while the server was down", async () => {
            const runId = await pauseByUsageLimit();
            const restarted = await bed.restartServer();
            restarted.clock.set(AFTER_RESUME_AT);

            const report = await recoverOn(restarted);

            expect(report.resumed).toEqual([runId]);
            await expect(restarted.findRun(runId)).resolves.toMatchObject({ status: "RUNNING" });
        });
    });

    describe("a run whose state was lost", () => {
        it("fails the run that has no snapshot", async () => {
            const lost = buildRunRecord({ id: "run_lost", projectId: TEST_PROJECT_ID, flowId });
            await bed.runs.createRun({ ...lost, status: "RUNNING" });
            const restarted = await bed.restartServer();

            const report = await recoverOn(restarted);

            expect(report.failed).toEqual([{ runId: "run_lost", reason: RUN_STATE_LOST }]);
            await expect(restarted.findRun("run_lost")).resolves.toMatchObject({
                status: "FAILED",
                error: RUN_STATE_LOST,
            });
        });

        it("fails the paused run whose snapshot cannot be restored", async () => {
            const lost = buildRunRecord({
                id: "run_lost",
                projectId: TEST_PROJECT_ID,
                flowId,
                status: "PAUSED",
                pauseReason: "user",
            });
            await bed.runs.createRun(lost);
            await bed.runs.saveTransition({ run: lost, snapshot: { run: "corrompido" } });
            const restarted = await bed.restartServer();

            const report = await recoverOn(restarted);

            expect(report.failed).toEqual([{ runId: "run_lost", reason: RUN_STATE_LOST }]);
            await expect(restarted.findRun("run_lost")).resolves.toMatchObject({
                status: "FAILED",
                pauseReason: undefined,
            });
        });
    });

    describe("workspaces", () => {
        it("closes every workspace left open, before any run opens a new one", async () => {
            const started = await bed.startRun(flowId);
            await crashWithTwoDevsRunning(started.id);
            const orphan = await bed.runtime.openWorkspace(
                orphanWorkspaceSpec(),
                SILENT_HOOKS,
                NEVER_ABORTED,
            );
            const leftOpenIds = (await bed.runtime.listOpenWorkspaces()).map(({ id }) => id);
            const restarted = await bed.restartServer();

            const report = await recoverOn(restarted);

            const callKinds = restarted.runtime.calls.map((call) => call.kind);
            expect([...report.closedWorkspaces].sort()).toEqual([...leftOpenIds].sort());
            expect(report.closedWorkspaces).toContain(orphan.id);
            expect(callKinds.slice(0, leftOpenIds.length)).toEqual(leftOpenIds.map(() => "close"));
        });
    });

    describe("log", () => {
        it("logs what the recovery did in one line", async () => {
            const started = await bed.startRun(flowId);
            await crashWithTwoDevsRunning(started.id);
            const restarted = await bed.restartServer();

            await recoverOn(restarted);

            expect(logLines).toEqual([
                "[forja] recuperação: 1 run retomada, 0 runs pausadas, 0 runs falharam, " +
                    "2 NodeRuns interrompidos, 2 workspaces fechados",
            ]);
        });
    });
});

function orphanWorkspaceSpec(): WorkspaceSpec {
    return {
        projectId: TEST_PROJECT_ID,
        runId: "run_finished_long_ago",
        workItemId: "itm_orphan",
        repoPath: "/repos/forja",
        branch: "forja/item-orphan",
        baseBranch: "main",
        image: "forja-agent",
        env: {},
        setupCommands: [],
        files: [],
    };
}
