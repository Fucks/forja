import { ConflictError, DomainValidationError } from "@/server/errors.js";
import type { RunRecord } from "@/server/runs/run_repository.js";
import { createRunService, type RunService } from "@/server/runs/run_service.js";
import type { Trigger } from "@/shared/trigger_types.js";
import { updateNode } from "@/test/factories/flow_graph_variations.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildIssueSnapshot, ExecutorTestBed, TEST_PROJECT_ID } from "@/test/executor_test_bed.js";

const ISSUE_1 = buildIssueSnapshot(1);
const ISSUE_2 = buildIssueSnapshot(2);
const ITEMS = [ISSUE_1, ISSUE_2];
const DEV_PROMPT = "Implemente a issue";
const DEV_DURATION_MS = 60_000;
const DEV_ATTEMPTS = 2;
const UNPUBLISHED_FLOW_MESSAGE = "Publique o fluxo antes de executar.";
const AUDIT_ENTRIES_LISTED = 10;
const NIGHTLY_TRIGGER: Trigger = {
    id: "trg_noturno",
    projectId: TEST_PROJECT_ID,
    flowId: "flw_entrega",
    name: "Noturno",
    enabled: true,
    policy: "skip",
    itemSelection: "source",
    config: { kind: "manual" },
    createdAt: "2026-11-01T10:00:00.000Z",
};

describe("run service", () => {
    let bed: ExecutorTestBed;
    let service: RunService;
    let flowId: string;

    beforeEach(async () => {
        bed = new ExecutorTestBed(ITEMS);
        service = createRunService({
            executor: bed.executor,
            runs: bed.runs,
            flows: bed.flows,
            events: bed.events,
            usage: bed.usage,
            triggers: { listByProject: () => [NIGHTLY_TRIGGER] },
            audit: bed.audit,
        });
        flowId = await bed.publishFlow(buildCanonicalFlow());
    });

    afterEach(() => {
        bed.close();
    });

    function startRun(): Promise<RunRecord> {
        return service.startRun(TEST_PROJECT_ID, { flowId, itemIds: ITEMS.map((item) => item.id) });
    }

    async function listRunCancellations(): Promise<unknown[]> {
        const entries = await bed.audit.list(AUDIT_ENTRIES_LISTED);

        return entries.filter(isRunCancellation);
    }

    async function startRunWithDevsRunning(): Promise<RunRecord> {
        bed.runtime.script({ match: { promptIncludes: DEV_PROMPT }, durationMs: DEV_DURATION_MS });
        const run = await startRun();
        await bed.advanceUntil(async () => {
            const developers = await bed.nodeRunsOf(run.id, "dev");
            const runningDevelopers = developers.filter((nodeRun) => nodeRun.status === "RUNNING");

            return runningDevelopers.length === ITEMS.length;
        });

        return run;
    }

    async function startFinishedRunWithFailedDev(): Promise<RunRecord> {
        bed.runtime.script({
            match: { promptIncludes: DEV_PROMPT, workItemId: ISSUE_2.id },
            times: DEV_ATTEMPTS,
            durationMs: DEV_DURATION_MS,
            error: { type: "runtime", message: "claude saiu com código 1" },
        });
        const run = await startRun();

        return bed.runUntilFinished(run.id);
    }

    describe("startRun", () => {
        it("starts a run of the latest published version that the list shows", async () => {
            const started = await startRun();

            const listed = await service.listRuns(TEST_PROJECT_ID, { limit: 10 });

            expect(started).toMatchObject({
                flowId,
                flowVersion: 1,
                itemIds: [ISSUE_1.id, ISSUE_2.id],
            });
            expect(listed.map((run) => run.id)).toEqual([started.id]);
        });

        it("refuses a flow without a published version, asking to publish it", async () => {
            const draftOnly = await bed.flows.create(TEST_PROJECT_ID, { name: "Rascunho" });

            const starting = service.startRun(TEST_PROJECT_ID, {
                flowId: draftOnly.id,
                itemIds: [],
            });

            await expect(starting).rejects.toBeInstanceOf(DomainValidationError);
            await expect(starting).rejects.toThrow(UNPUBLISHED_FLOW_MESSAGE);
        });
    });

    describe("listRuns", () => {
        it("pages the runs newest first", async () => {
            const first = await startRun();
            bed.clock.advance(1_000);
            const second = await startRun();
            bed.clock.advance(1_000);
            const third = await startRun();

            const firstPage = await service.listRuns(TEST_PROJECT_ID, { limit: 2 });
            const secondPage = await service.listRuns(TEST_PROJECT_ID, {
                limit: 2,
                before: second.id,
            });

            expect(firstPage.map((run) => run.id)).toEqual([third.id, second.id]);
            expect(secondPage.map((run) => run.id)).toEqual([first.id]);
        });

        it("lists each run with its flow name, item counts, duration and cost", async () => {
            const finished = await startFinishedRunWithFailedDev();
            const finishedAt = finished.finishedAt?.getTime() ?? 0;
            const startedAt = finished.startedAt?.getTime() ?? 0;
            const usageRecords = await bed.usage.forRun(finished.id);
            const costUsd = usageRecords.reduce((total, record) => total + record.costUsd, 0);

            const [listed] = await service.listRuns(TEST_PROJECT_ID, { limit: 10 });

            expect(listed).toMatchObject({
                id: finished.id,
                flowId,
                flowName: "Entrega",
                flowVersion: 1,
                status: finished.status,
                itemCount: ITEMS.length,
                failedItemCount: 1,
                createdAt: finished.createdAt.toISOString(),
                durationMs: finishedAt - startedAt,
                costUsd,
            });
            expect(listed?.triggerName).toBeUndefined();
        });

        it("leaves the duration out while the run is active", async () => {
            await startRunWithDevsRunning();

            const [listed] = await service.listRuns(TEST_PROJECT_ID, { limit: 10 });

            expect(listed?.status).toBe("RUNNING");
            expect(listed?.durationMs).toBeUndefined();
        });

        it("names the trigger that started the run", async () => {
            await bed.executor.startRun({
                projectId: TEST_PROJECT_ID,
                flowId,
                itemIds: [],
                triggerId: NIGHTLY_TRIGGER.id,
            });

            const [listed] = await service.listRuns(TEST_PROJECT_ID, { limit: 10 });

            expect(listed?.triggerName).toBe(NIGHTLY_TRIGGER.name);
        });
    });

    describe("run transitions", () => {
        it("pauses a running run for the user and resumes it", async () => {
            const run = await startRunWithDevsRunning();

            await service.pauseRun(run.id);
            const paused = await bed.findRun(run.id);
            await service.resumeRun(run.id);
            const resumed = await bed.findRun(run.id);

            expect(paused).toMatchObject({ status: "PAUSED", pauseReason: "user" });
            expect(resumed.status).toBe("RUNNING");
        });

        it("cancels a running run", async () => {
            const run = await startRunWithDevsRunning();

            await service.cancelRun(run.id);

            expect((await bed.runUntilFinished(run.id)).status).toBe("CANCELED");
        });

        it("records the cancellation in the audit log", async () => {
            const run = await startRunWithDevsRunning();

            await service.cancelRun(run.id);

            await expect(listRunCancellations()).resolves.toEqual([
                expect.objectContaining({ target: { kind: "run", id: run.id } }),
            ]);
        });

        it("refuses to pause a finished run", async () => {
            const run = await bed.runUntilFinished((await startRun()).id);

            await expect(service.pauseRun(run.id)).rejects.toBeInstanceOf(ConflictError);
        });

        it("refuses to resume a run that is not paused", async () => {
            const run = await startRunWithDevsRunning();

            await expect(service.resumeRun(run.id)).rejects.toBeInstanceOf(ConflictError);
        });

        it("refuses to cancel a finished run", async () => {
            const run = await bed.runUntilFinished((await startRun()).id);

            await expect(service.cancelRun(run.id)).rejects.toBeInstanceOf(ConflictError);
            await expect(listRunCancellations()).resolves.toEqual([]);
        });
    });

    describe("getRunView", () => {
        it("brings the graph of the run's version even after the draft changed", async () => {
            const run = await startRun();
            const draft = await bed.flows.getDraft(flowId);
            const editedGraph = updateNode(draft.graph, "dev", (node) => ({
                ...node,
                position: { x: 999, y: 999 },
            }));
            await bed.flows.saveDraft(flowId, editedGraph, draft.revision);

            const view = await service.getRunView(run.id);

            expect(view.graph).toEqual((await bed.flows.getVersion(flowId, 1)).graph);
            expect(view.run).toMatchObject({ id: run.id, flowName: "Entrega" });
        });

        it("brings the NodeRuns, the progress of the maps and the last event id", async () => {
            const run = await startRunWithDevsRunning();

            const view = await service.getRunView(run.id);

            expect(view.nodeRuns).toEqual(await bed.runs.listNodeRuns(run.id));
            expect(view.groups.develop).toMatchObject({ running: 2 });
            expect(view.lastEventId).toBe(bed.events.lastEventId());
        });
    });

    describe("NodeRuns", () => {
        it("retries a failed NodeRun of a finished run, reopening the run", async () => {
            const run = await startFinishedRunWithFailedDev();
            const lastFailedDev = await bed.findNodeRun(
                run.id,
                "dev",
                (nodeRun) => nodeRun.status === "FAILED" && nodeRun.attempt === DEV_ATTEMPTS,
            );

            await service.retryNodeRun(lastFailedDev.id);

            expect((await bed.findRun(run.id)).status).toBe("RUNNING");
            const finished = await bed.runUntilFinished(run.id);
            expect(finished.failedItemIds).toEqual([]);
        });

        it("refuses to retry an attempt that was already retried", async () => {
            const run = await startFinishedRunWithFailedDev();
            const firstFailedDev = await bed.findNodeRun(
                run.id,
                "dev",
                (nodeRun) => nodeRun.status === "FAILED" && nodeRun.attempt === 1,
            );

            const retrying = service.retryNodeRun(firstFailedDev.id);

            await expect(retrying).rejects.toBeInstanceOf(ConflictError);
        });

        it("refuses to retry a NodeRun of a canceled run", async () => {
            const run = await startRunWithDevsRunning();
            await service.cancelRun(run.id);
            await bed.runUntilFinished(run.id);
            const developer = await bed.findNodeRun(run.id, "dev");

            await expect(service.retryNodeRun(developer.id)).rejects.toBeInstanceOf(ConflictError);
        });

        it("cancels a running NodeRun of a map, failing only its item", async () => {
            const run = await startRunWithDevsRunning();
            const runningDev = await bed.findNodeRun(
                run.id,
                "dev",
                (nodeRun) => nodeRun.status === "RUNNING",
            );

            await service.cancelNodeRun(runningDev.id);

            const finished = await bed.runUntilFinished(run.id);
            expect(finished.failedItemIds).toEqual([runningDev.workItemId]);
        });

        it("refuses to cancel a NodeRun that already finished", async () => {
            const run = await bed.runUntilFinished((await startRun()).id);
            const developer = await bed.findNodeRun(run.id, "dev");

            await expect(service.cancelNodeRun(developer.id)).rejects.toBeInstanceOf(ConflictError);
        });

        it("brings a NodeRun with its artifacts", async () => {
            const run = await bed.runUntilFinished((await startRun()).id);
            const developer = await bed.findNodeRun(run.id, "dev");

            const detail = await service.getNodeRun(developer.id);

            expect(detail.nodeRun).toEqual(developer);
            expect(detail.artifacts).toEqual(await bed.runs.listArtifacts(developer.id));
        });
    });

    describe("raiseRunBudget", () => {
        it("pauses the run when the new limit is reached and resumes it when raised again", async () => {
            const run = await startRunWithDevsRunning();

            await service.raiseRunBudget(run.id, { run: { maxTokens: 1 } });
            await bed.advanceUntil(async () => (await bed.findRun(run.id)).status === "PAUSED");
            const pausedByBudget = await bed.findRun(run.id);
            await service.raiseRunBudget(run.id, { run: { maxTokens: 1_000_000 } });

            expect(pausedByBudget.pauseReason).toBe("budget");
            expect((await bed.findRun(run.id)).status).toBe("RUNNING");
        });

        it("refuses to raise the budget of a finished run", async () => {
            const run = await bed.runUntilFinished((await startRun()).id);

            const raising = service.raiseRunBudget(run.id, { run: { maxTokens: 10 } });

            await expect(raising).rejects.toBeInstanceOf(ConflictError);
        });
    });
});

function isRunCancellation(entry: unknown): boolean {
    return (
        typeof entry === "object" &&
        entry !== null &&
        "action" in entry &&
        entry.action === "run.canceled"
    );
}
