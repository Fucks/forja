import { transitionRun } from "@/engine/run_state.js";
import type { RunRepository } from "@/server/runs/run_repository.js";
import { RunNotFoundError, TransitionWithoutRunError } from "@/server/runs/run_repository.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildArtifactRecord, buildRunRecord } from "@/test/factories/run_record_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { InMemoryRunRepository } from "@/test/fakes/in_memory_run_repository.js";
import { createTestDb } from "@/test/test_db.js";
import { RUN_STATUS_NAMES } from "@/shared/events.js";

interface RepositoryUnderTest {
    repository: RunRepository;
    close: () => void;
}

const IMPLEMENTATIONS: { name: string; open: () => RepositoryUnderTest }[] = [
    {
        name: "SqliteRunRepository",
        open: () => {
            const handle = createTestDb();
            return {
                repository: new SqliteRunRepository(handle.db, new FakeClock()),
                close: () => handle.close(),
            };
        },
    },
    {
        name: "InMemoryRunRepository",
        open: () => ({ repository: new InMemoryRunRepository(), close: () => undefined }),
    },
];

const STARTED_AT = new Date("2026-01-01T12:01:00Z");
const RESUME_AT = new Date("2026-01-01T17:00:00Z");
const FINISHED_AT = new Date("2026-01-01T12:30:00Z");

function minutesAfterNoon(minutes: number): Date {
    return new Date(Date.UTC(2026, 0, 1, 12, minutes));
}

describe.each(IMPLEMENTATIONS)("$name", ({ open }) => {
    let repository: RunRepository;
    let close: () => void;

    beforeEach(() => {
        ({ repository, close } = open());
    });

    afterEach(() => {
        close();
    });

    describe("createRun and getRun", () => {
        it("returns the created run with its dates as Date", async () => {
            const run = buildRunRecord({
                status: "PAUSED",
                pauseReason: "usage_limit",
                resumeAt: RESUME_AT,
                startedAt: STARTED_AT,
                triggerId: "trigger-1",
                itemIds: ["item-1", "item-2"],
                failedItemIds: ["item-2"],
                error: "falhou",
            });

            await repository.createRun(run);

            expect(await repository.getRun(run.id)).toEqual(run);
        });

        it("returns undefined for a run that was never created", async () => {
            expect(await repository.getRun("missing-run")).toBeUndefined();
        });
    });

    describe("saveTransition of the run", () => {
        it("updates the run state and keeps what was set at creation", async () => {
            const run = buildRunRecord({ triggerId: "trigger-1", itemIds: ["item-1"] });
            await repository.createRun(run);

            await repository.saveTransition({ run: transitionRun(run, "RUNNING", STARTED_AT) });

            expect(await repository.getRun(run.id)).toEqual({
                ...run,
                status: "RUNNING",
                startedAt: STARTED_AT,
            });
        });

        it("clears the pause reason and resume time when the run leaves PAUSED", async () => {
            const pausedRun = buildRunRecord({
                status: "PAUSED",
                pauseReason: "usage_limit",
                resumeAt: RESUME_AT,
                startedAt: STARTED_AT,
            });
            await repository.createRun(pausedRun);

            await repository.saveTransition({
                run: transitionRun(pausedRun, "RUNNING", RESUME_AT),
            });

            const savedRun = await repository.getRun(pausedRun.id);
            expect(savedRun?.pauseReason).toBeUndefined();
            expect(savedRun?.resumeAt).toBeUndefined();
        });

        it("replaces the failed item ids when the run reports failed items", async () => {
            const run = buildRunRecord({ status: "RUNNING", itemIds: ["item-1", "item-2"] });
            await repository.createRun(run);

            await repository.saveTransition({ run: { ...run, failedItems: ["item-2"] } });

            expect((await repository.getRun(run.id))?.failedItemIds).toEqual(["item-2"]);
        });

        it("keeps the failed item ids when the run reports no failed items", async () => {
            const run = buildRunRecord({ status: "RUNNING", failedItemIds: ["item-2"] });
            await repository.createRun(run);

            await repository.saveTransition({
                run: transitionRun(run, "SUCCEEDED", FINISHED_AT, { failedItems: undefined }),
            });

            expect((await repository.getRun(run.id))?.failedItemIds).toEqual(["item-2"]);
        });

        it("rejects a transition of a run that was never created", async () => {
            const transition = repository.saveTransition({
                nodeRuns: [buildNodeRunState({ runId: "missing-run" })],
            });

            await expect(transition).rejects.toThrow(RunNotFoundError);
        });

        it("rejects a transition that names no run", async () => {
            await expect(repository.saveTransition({ snapshot: {} })).rejects.toThrow(
                TransitionWithoutRunError,
            );
        });
    });

    describe("saveTransition of NodeRuns", () => {
        it("returns the saved NodeRun with its dates as Date", async () => {
            await repository.createRun(buildRunRecord());
            const nodeRun = buildNodeRunState({
                workItemId: "item-1",
                iteration: 2,
                attempt: 3,
                groupPath: [{ groupId: "loop-1", iteration: 2 }],
                status: "FAILED",
                queuedAt: STARTED_AT,
                startedAt: STARTED_AT,
                finishedAt: FINISHED_AT,
                error: { kind: "runtime", message: "Agente encerrou" },
                inputs: { prompt: "Implemente" },
                outputs: { summary: "Feito" },
            });

            await repository.saveTransition({ nodeRuns: [nodeRun] });

            expect(await repository.getNodeRun(nodeRun.id)).toEqual(nodeRun);
        });

        it("keeps the error of a NodeRun that retrying cannot fix", async () => {
            await repository.createRun(buildRunRecord());
            const nodeRun = buildNodeRunState({
                status: "FAILED",
                error: { kind: "workspace", message: "Sem credencial", isRetryable: false },
            });

            await repository.saveTransition({ nodeRuns: [nodeRun] });

            expect((await repository.getNodeRun(nodeRun.id))?.error).toEqual(nodeRun.error);
        });

        it("updates a NodeRun saved again without changing its position", async () => {
            await repository.createRun(buildRunRecord());
            const first = buildNodeRunState({ id: "node-run-1" });
            const second = buildNodeRunState({ id: "node-run-2" });
            await repository.saveTransition({ nodeRuns: [first, second] });

            const queuedFirst = { ...first, status: "QUEUED" as const, queuedAt: STARTED_AT };
            await repository.saveTransition({ nodeRuns: [queuedFirst] });

            expect(await repository.listNodeRuns("run-1")).toEqual([queuedFirst, second]);
        });

        it("lists only the NodeRuns of the given run", async () => {
            await repository.createRun(buildRunRecord({ id: "run-1" }));
            await repository.createRun(buildRunRecord({ id: "run-2" }));
            const nodeRunOfRun1 = buildNodeRunState({ id: "node-run-1", runId: "run-1" });
            await repository.saveTransition({ nodeRuns: [nodeRunOfRun1] });
            await repository.saveTransition({
                nodeRuns: [buildNodeRunState({ id: "node-run-2", runId: "run-2" })],
            });

            expect(await repository.listNodeRuns("run-1")).toEqual([nodeRunOfRun1]);
        });

        it("returns undefined for a NodeRun that was never saved", async () => {
            expect(await repository.getNodeRun("missing-node-run")).toBeUndefined();
        });
    });

    describe("saveTransition of artifacts and snapshot", () => {
        it("lists the artifacts of a NodeRun", async () => {
            await repository.createRun(buildRunRecord());
            const nodeRun = buildNodeRunState({ id: "node-run-1" });
            const summary = buildArtifactRecord({ id: "artifact-1", nodeRunId: nodeRun.id });
            const report = buildArtifactRecord({
                id: "artifact-2",
                nodeRunId: nodeRun.id,
                name: "report",
                kind: "json",
                value: { approved: true },
            });

            await repository.saveTransition({ nodeRuns: [nodeRun], artifacts: [summary, report] });

            expect(await repository.listArtifacts(nodeRun.id)).toEqual([summary, report]);
        });

        it("returns the latest snapshot saved for the run", async () => {
            const run = buildRunRecord();
            await repository.createRun(run);
            await repository.saveTransition({ run, snapshot: { step: 1 } });

            await repository.saveTransition({ run, snapshot: { step: 2 } });

            expect(await repository.getSnapshot(run.id)).toEqual({ step: 2 });
        });

        it("returns undefined when the run has no snapshot", async () => {
            await repository.createRun(buildRunRecord());

            expect(await repository.getSnapshot("run-1")).toBeUndefined();
        });

        it("saves nothing when the transition fails halfway", async () => {
            const run = buildRunRecord();
            await repository.createRun(run);
            const unserializableSnapshot = { size: BigInt(1) };

            const transition = repository.saveTransition({
                run: transitionRun(run, "RUNNING", STARTED_AT),
                nodeRuns: [buildNodeRunState()],
                artifacts: [buildArtifactRecord()],
                snapshot: unserializableSnapshot,
            });

            await expect(transition).rejects.toThrow();
            expect(await repository.getRun(run.id)).toEqual(run);
            expect(await repository.listNodeRuns(run.id)).toEqual([]);
            expect(await repository.listArtifacts("node-run-1")).toEqual([]);
            expect(await repository.getSnapshot(run.id)).toBeUndefined();
        });
    });

    describe("listRuns", () => {
        beforeEach(async () => {
            await repository.createRun(
                buildRunRecord({ id: "run-1", createdAt: minutesAfterNoon(1), status: "FAILED" }),
            );
            await repository.createRun(
                buildRunRecord({ id: "run-2", createdAt: minutesAfterNoon(2), flowId: "flow-2" }),
            );
            await repository.createRun(
                buildRunRecord({ id: "run-3", createdAt: minutesAfterNoon(3), status: "RUNNING" }),
            );
            await repository.createRun(
                buildRunRecord({ id: "run-4", createdAt: minutesAfterNoon(4), projectId: "other" }),
            );
        });

        async function listRunIds(...args: Parameters<RunRepository["listRuns"]>) {
            const runs = await repository.listRuns(...args);
            return runs.map((run) => run.id);
        }

        it("lists the project's newest runs first, up to the limit", async () => {
            expect(await listRunIds("project-1", { limit: 2 })).toEqual(["run-3", "run-2"]);
        });

        it("continues the list after the run given as cursor", async () => {
            expect(await listRunIds("project-1", { limit: 2, before: "run-2" })).toEqual(["run-1"]);
        });

        it("filters by flow", async () => {
            expect(await listRunIds("project-1", { limit: 10, flowId: "flow-2" })).toEqual([
                "run-2",
            ]);
        });

        it("filters by any of the given statuses", async () => {
            const runIds = await listRunIds("project-1", {
                limit: 10,
                status: ["FAILED", "RUNNING"],
            });

            expect(runIds).toEqual(["run-3", "run-1"]);
        });

        it("does not filter by status when the status list is empty", async () => {
            expect(await listRunIds("project-1", { limit: 10, status: [] })).toEqual([
                "run-3",
                "run-2",
                "run-1",
            ]);
        });
    });

    describe("listActiveRuns", () => {
        it("lists only the queued, running and paused runs of every project", async () => {
            for (const [index, status] of RUN_STATUS_NAMES.entries()) {
                await repository.createRun(
                    buildRunRecord({
                        id: status,
                        projectId: `project-${index}`,
                        createdAt: minutesAfterNoon(index),
                        status,
                    }),
                );
            }

            const activeRuns = await repository.listActiveRuns();

            expect(activeRuns.map((run) => run.id)).toEqual(["QUEUED", "RUNNING", "PAUSED"]);
        });
    });

    describe("latestNodeRunsByItem", () => {
        it("returns each item's NodeRuns from the latest run that worked on it", async () => {
            await repository.createRun(
                buildRunRecord({ id: "old", createdAt: minutesAfterNoon(1) }),
            );
            await repository.createRun(
                buildRunRecord({ id: "new", createdAt: minutesAfterNoon(2) }),
            );
            const oldNodeRun = buildNodeRunState({ id: "old-dev", runId: "old", workItemId: "a" });
            const newNodeRun = buildNodeRunState({ id: "new-dev", runId: "new", workItemId: "a" });
            const otherItemNodeRun = buildNodeRunState({
                id: "old-dev-b",
                runId: "old",
                workItemId: "b",
            });
            await repository.saveTransition({ nodeRuns: [oldNodeRun, otherItemNodeRun] });
            await repository.saveTransition({ nodeRuns: [newNodeRun] });

            const nodeRunsByItem = await repository.latestNodeRunsByItem("project-1", ["a", "b"]);

            expect(nodeRunsByItem).toEqual({ a: [newNodeRun], b: [otherItemNodeRun] });
        });

        it("returns no NodeRuns for items that no run of the project worked on", async () => {
            await repository.createRun(buildRunRecord({ id: "elsewhere", projectId: "other" }));
            await repository.saveTransition({
                nodeRuns: [buildNodeRunState({ runId: "elsewhere", workItemId: "a" })],
            });

            const nodeRunsByItem = await repository.latestNodeRunsByItem("project-1", ["a"]);

            expect(nodeRunsByItem).toEqual({ a: [] });
        });
    });

    describe("listNodeRunsOfItem", () => {
        it("lists the item's NodeRuns of every run, oldest run first", async () => {
            await repository.createRun(
                buildRunRecord({ id: "new", createdAt: minutesAfterNoon(2) }),
            );
            await repository.createRun(
                buildRunRecord({ id: "old", createdAt: minutesAfterNoon(1) }),
            );
            const oldNodeRun = buildNodeRunState({ id: "old-dev", runId: "old", workItemId: "a" });
            const newNodeRun = buildNodeRunState({ id: "new-dev", runId: "new", workItemId: "a" });
            const otherItemNodeRun = buildNodeRunState({
                id: "old-dev-b",
                runId: "old",
                workItemId: "b",
            });
            await repository.saveTransition({ nodeRuns: [newNodeRun] });
            await repository.saveTransition({ nodeRuns: [oldNodeRun, otherItemNodeRun] });

            const nodeRunsOfItem = await repository.listNodeRunsOfItem("a");

            expect(nodeRunsOfItem).toEqual([oldNodeRun, newNodeRun]);
        });
    });

    describe("listItemIdsWithArtifact", () => {
        it("lists once each item of the project whose NodeRuns saved an artifact of the kind", async () => {
            await repository.createRun(buildRunRecord({ id: "first" }));
            await repository.createRun(buildRunRecord({ id: "second" }));
            await repository.saveTransition({
                nodeRuns: [
                    buildNodeRunState({ id: "pr-a1", runId: "first", workItemId: "a" }),
                    buildNodeRunState({ id: "pr-a2", runId: "second", workItemId: "a" }),
                    buildNodeRunState({ id: "summary-b", runId: "first", workItemId: "b" }),
                ],
                artifacts: [
                    buildArtifactRecord({
                        id: "1",
                        runId: "first",
                        nodeRunId: "pr-a1",
                        kind: "pr_url",
                    }),
                    buildArtifactRecord({
                        id: "2",
                        runId: "second",
                        nodeRunId: "pr-a2",
                        kind: "pr_url",
                    }),
                    buildArtifactRecord({
                        id: "3",
                        runId: "first",
                        nodeRunId: "summary-b",
                        kind: "text",
                    }),
                ],
            });

            const itemIds = await repository.listItemIdsWithArtifact("project-1", "pr_url");

            expect(itemIds).toEqual(["a"]);
        });

        it("ignores the artifacts of other projects", async () => {
            await repository.createRun(buildRunRecord({ id: "elsewhere", projectId: "other" }));
            await repository.saveTransition({
                nodeRuns: [buildNodeRunState({ runId: "elsewhere", workItemId: "a" })],
                artifacts: [buildArtifactRecord({ runId: "elsewhere", kind: "pr_url" })],
            });

            const itemIds = await repository.listItemIdsWithArtifact("project-1", "pr_url");

            expect(itemIds).toEqual([]);
        });
    });
});
