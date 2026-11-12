import type { NodeRunState } from "@/engine/node_run_state.js";
import type { ArtifactRecord } from "@/server/runs/run_repository.js";
import { buildItemTimeline } from "@/server/work_items/item_timeline.js";
import type { ItemTimelineDeps } from "@/server/work_items/item_timeline.js";
import type { ItemTimeline } from "@/shared/board_types.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowSummary, FlowVersion } from "@/shared/flow_types.js";
import type { UsageRecord } from "@/shared/usage_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildArtifactRecord, buildRunRecord } from "@/test/factories/run_record_factory.js";
import { buildNewUsageRecord } from "@/test/factories/usage_record_factory.js";
import { InMemoryRunRepository } from "@/test/fakes/in_memory_run_repository.js";

const PROJECT_ID = "prj_forja";
const FLOW_ID = "flw_sandcastle";
const ITEM_ID = "itm_42";
const OLD_RUN_ID = "run_old";
const NEW_RUN_ID = "run_new";
const PUBLISHED_AT = "2026-11-10T12:00:00.000Z";
const PR_URL = "https://github.com/Fucks/forja/pull/12";

function minutesAfterNoon(minutes: number): Date {
    return new Date(Date.UTC(2026, 10, 10, 12, minutes));
}

function buildFlowSummary(): FlowSummary {
    return {
        id: FLOW_ID,
        projectId: PROJECT_ID,
        name: "Sandcastle",
        isDefault: true,
        archived: false,
        latestVersion: 1,
        draftUpdatedAt: PUBLISHED_AT,
        draftRevision: 1,
    };
}

function buildUsageRecord(nodeRunId: string, costUsd: number): UsageRecord {
    return {
        ...buildNewUsageRecord({ nodeRunId, workItemId: ITEM_ID }),
        id: `usg_${nodeRunId}_${costUsd}`,
        costUsd,
        priceEstimated: false,
        at: PUBLISHED_AT,
    };
}

describe("buildItemTimeline", () => {
    let runs: InMemoryRunRepository;
    let usageRecords: UsageRecord[];
    let graph: FlowGraph;

    beforeEach(async () => {
        runs = new InMemoryRunRepository();
        usageRecords = [];
        graph = buildCanonicalFlow();
        await runs.createRun(
            buildRunRecord({
                id: OLD_RUN_ID,
                projectId: PROJECT_ID,
                flowId: FLOW_ID,
                createdAt: minutesAfterNoon(0),
            }),
        );
        await runs.createRun(
            buildRunRecord({
                id: NEW_RUN_ID,
                projectId: PROJECT_ID,
                flowId: FLOW_ID,
                createdAt: minutesAfterNoon(30),
            }),
        );
    });

    function buildTimeline(): Promise<ItemTimeline> {
        const deps: ItemTimelineDeps = {
            runs,
            usage: {
                forRun: (runId) =>
                    Promise.resolve(usageRecords.filter((record) => record.runId === runId)),
            },
            flows: {
                list: () => Promise.resolve([buildFlowSummary()]),
                getVersion: (flowId, version): Promise<FlowVersion> =>
                    Promise.resolve({
                        flowId,
                        version,
                        graph,
                        publishedAt: PUBLISHED_AT,
                    }),
            },
        };

        return buildItemTimeline(ITEM_ID, deps);
    }

    async function saveNodeRuns(
        runId: string,
        nodeRuns: Partial<NodeRunState>[],
        artifacts: Partial<ArtifactRecord>[] = [],
    ): Promise<void> {
        await runs.saveTransition({
            nodeRuns: nodeRuns.map((nodeRun) =>
                buildNodeRunState({ runId, workItemId: ITEM_ID, ...nodeRun }),
            ),
            artifacts: artifacts.map((artifact) => buildArtifactRecord({ runId, ...artifact })),
        });
    }

    it("lists the NodeRuns of the item from every run, the latest started first", async () => {
        await saveNodeRuns(OLD_RUN_ID, [
            { id: "nr_old_tl", nodeId: "tl", status: "SUCCEEDED", startedAt: minutesAfterNoon(1) },
        ]);
        await saveNodeRuns(NEW_RUN_ID, [
            { id: "nr_new_tl", nodeId: "tl", status: "SUCCEEDED", startedAt: minutesAfterNoon(31) },
            { id: "nr_new_dev", nodeId: "dev", status: "RUNNING", startedAt: minutesAfterNoon(35) },
        ]);

        const timeline = await buildTimeline();

        expect(timeline.entries.map((entry) => entry.nodeRunId)).toEqual([
            "nr_new_dev",
            "nr_new_tl",
            "nr_old_tl",
        ]);
    });

    it("puts the NodeRuns that have not started yet on top", async () => {
        await saveNodeRuns(NEW_RUN_ID, [
            { id: "nr_tl", nodeId: "tl", status: "SUCCEEDED", startedAt: minutesAfterNoon(31) },
            { id: "nr_dev", nodeId: "dev", status: "QUEUED" },
        ]);

        const timeline = await buildTimeline();

        expect(timeline.entries.map((entry) => entry.nodeRunId)).toEqual(["nr_dev", "nr_tl"]);
    });

    it("describes each entry with its run, flow, node and summary", async () => {
        await saveNodeRuns(NEW_RUN_ID, [
            {
                id: "nr_dev",
                nodeId: "dev",
                status: "SUCCEEDED",
                iteration: 2,
                attempt: 3,
                startedAt: minutesAfterNoon(31),
                finishedAt: minutesAfterNoon(40),
                outputs: { summary: "Implementei a tela de login." },
            },
        ]);

        const timeline = await buildTimeline();

        expect(timeline.entries).toEqual([
            {
                runId: NEW_RUN_ID,
                flowName: "Sandcastle",
                nodeRunId: "nr_dev",
                nodeLabel: "Dev",
                status: "SUCCEEDED",
                iteration: 2,
                attempt: 3,
                startedAt: minutesAfterNoon(31).toISOString(),
                finishedAt: minutesAfterNoon(40).toISOString(),
                summary: "Implementei a tela de login.",
            },
        ]);
    });

    it("shows the cost of each NodeRun and sums the item's NodeRuns of every run", async () => {
        await saveNodeRuns(OLD_RUN_ID, [{ id: "nr_old_tl", nodeId: "tl", status: "SUCCEEDED" }]);
        await saveNodeRuns(NEW_RUN_ID, [
            { id: "nr_new_dev", nodeId: "dev", status: "SUCCEEDED" },
            { id: "nr_new_review", nodeId: "reviewer", status: "QUEUED" },
        ]);
        usageRecords = [
            { ...buildUsageRecord("nr_old_tl", 0.5), runId: OLD_RUN_ID },
            { ...buildUsageRecord("nr_new_dev", 1), runId: NEW_RUN_ID },
            { ...buildUsageRecord("nr_new_dev", 0.25), runId: NEW_RUN_ID },
            { ...buildUsageRecord("nr_other_item", 9), runId: NEW_RUN_ID, workItemId: "itm_7" },
        ];

        const timeline = await buildTimeline();

        const costByNodeRun = Object.fromEntries(
            timeline.entries.map((entry) => [entry.nodeRunId, entry.costUsd]),
        );
        expect(costByNodeRun).toEqual({
            nr_old_tl: 0.5,
            nr_new_dev: 1.25,
            nr_new_review: undefined,
        });
        expect(timeline.totalCostUsd).toBe(1.75);
    });

    it("adds the latest pull request opened for the item", async () => {
        await saveNodeRuns(
            OLD_RUN_ID,
            [{ id: "nr_old_pr", nodeId: "open_pr", status: "SUCCEEDED" }],
            [{ id: "art_old", nodeRunId: "nr_old_pr", kind: "pr_url", value: `${PR_URL}0` }],
        );
        await saveNodeRuns(
            NEW_RUN_ID,
            [{ id: "nr_new_pr", nodeId: "open_pr", status: "SUCCEEDED" }],
            [{ id: "art_new", nodeRunId: "nr_new_pr", kind: "pr_url", value: PR_URL }],
        );

        const timeline = await buildTimeline();

        expect(timeline.prUrl).toBe(PR_URL);
    });

    it("adds the summary of the Especificar stage of the latest run as the spec", async () => {
        await saveNodeRuns(OLD_RUN_ID, [
            { id: "nr_old_tl", nodeId: "tl", outputs: { summary: "Spec antiga" } },
        ]);
        await saveNodeRuns(NEW_RUN_ID, [
            {
                id: "nr_new_tl_failed",
                nodeId: "tl",
                status: "FAILED",
                startedAt: minutesAfterNoon(31),
            },
            {
                id: "nr_new_tl",
                nodeId: "tl",
                status: "SUCCEEDED",
                startedAt: minutesAfterNoon(32),
                outputs: { summary: "Spec nova" },
            },
            {
                id: "nr_new_dev",
                nodeId: "dev",
                startedAt: minutesAfterNoon(33),
                outputs: { summary: "Implementado" },
            },
        ]);

        const timeline = await buildTimeline();

        expect(timeline.spec).toBe("Spec nova");
    });

    it("has no spec when the latest run did not specify the item yet", async () => {
        await saveNodeRuns(OLD_RUN_ID, [
            { id: "nr_old_tl", nodeId: "tl", outputs: { summary: "Spec antiga" } },
        ]);
        await saveNodeRuns(NEW_RUN_ID, [{ id: "nr_new_tl", nodeId: "tl", status: "RUNNING" }]);

        const timeline = await buildTimeline();

        expect(timeline.spec).toBeUndefined();
    });

    it("has no spec when the flow has no Especificar stage", async () => {
        graph = { ...graph, groups: [] };
        await saveNodeRuns(NEW_RUN_ID, [
            { id: "nr_source", nodeId: "source", outputs: { summary: "Itens" } },
        ]);

        const timeline = await buildTimeline();

        expect(timeline.spec).toBeUndefined();
    });

    it("returns an empty timeline for an item that never ran", async () => {
        const timeline = await buildTimeline();

        expect(timeline).toEqual({ entries: [], totalCostUsd: 0 });
    });
});
