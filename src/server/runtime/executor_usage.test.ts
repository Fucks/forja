import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import type { ModelPrice } from "@/shared/usage_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildNewUsageRecord, buildTokenUsage } from "@/test/factories/usage_record_factory.js";
import { buildIssueSnapshot, ExecutorTestBed, TEST_PROJECT_ID } from "@/test/executor_test_bed.js";

const ISSUE_1 = buildIssueSnapshot(1);
const DEV_PROMPT = "Implemente a issue";
const DEV_DURATION_MS = 60_000;
const ONE_MILLION = 1_000_000;
const AGENT_NODE_IDS = buildCanonicalFlow()
    .nodes.filter((node) => node.type === "agent")
    .map((node) => node.id);
const DEV_USAGE = buildTokenUsage({ inputTokens: ONE_MILLION, outputTokens: 0 });
const CONFIGURED_OPUS_PRICE: ModelPrice = {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheReadPerMTok: 0.3,
    cacheWritePerMTok: 3.75,
};

describe("executor usage", () => {
    let bed: ExecutorTestBed;
    let flowId: string;

    beforeEach(async () => {
        bed = new ExecutorTestBed([ISSUE_1]);
        flowId = await bed.publishFlow(buildCanonicalFlow());
        await bed.settings.saveGlobalSettings({
            ...DEFAULT_GLOBAL_SETTINGS,
            modelPrices: { opus: CONFIGURED_OPUS_PRICE },
        });
        bed.runtime.script({
            match: { promptIncludes: DEV_PROMPT },
            durationMs: DEV_DURATION_MS,
            result: { usage: DEV_USAGE },
        });
    });

    afterEach(() => {
        bed.close();
    });

    it("records the usage of the agent with the cost of the configured price", async () => {
        const started = await bed.startRun(flowId);

        await bed.runUntilFinished(started.id);

        const developer = await bed.findNodeRun(started.id, "dev");
        const records = await bed.usage.forRun(started.id);
        expect(records.find((record) => record.nodeRunId === developer.id)).toMatchObject({
            projectId: TEST_PROJECT_ID,
            flowId,
            nodeId: "dev",
            workItemId: ISSUE_1.id,
            iteration: developer.iteration,
            model: DEFAULT_PROJECT_SETTINGS.defaultModel,
            usage: DEV_USAGE,
            costUsd: CONFIGURED_OPUS_PRICE.inputPerMTok,
            priceEstimated: false,
        });
    });

    it("records one usage per agent NodeRun", async () => {
        const started = await bed.startRun(flowId);

        await bed.runUntilFinished(started.id);

        const recordedNodeRunIds = (await bed.usage.forRun(started.id)).map(
            (record) => record.nodeRunId,
        );
        const agentNodeRunIds = (await bed.runs.listNodeRuns(started.id))
            .filter((nodeRun) => AGENT_NODE_IDS.includes(nodeRun.nodeId))
            .map((nodeRun) => nodeRun.id);
        expect(recordedNodeRunIds.sort()).toEqual(agentNodeRunIds.sort());
    });

    it("publishes usage.recorded with the computed cost", async () => {
        const started = await bed.startRun(flowId);

        await bed.runUntilFinished(started.id);

        const developer = await bed.findNodeRun(started.id, "dev");
        expect(bed.publishedEventsOf("usage.recorded")).toContainEqual({
            type: "usage.recorded",
            runId: started.id,
            projectId: TEST_PROJECT_ID,
            nodeRunId: developer.id,
            inputTokens: ONE_MILLION,
            outputTokens: 0,
            costUsd: CONFIGURED_OPUS_PRICE.inputPerMTok,
        });
    });

    describe("daily budget", () => {
        async function useDailyBudgetUsd(dailyBudgetUsd: number): Promise<void> {
            await bed.changeProjectSettings({ dailyBudgetUsd });
        }

        async function runUntilPaused(runId: string): Promise<void> {
            await bed.advanceUntil(async () => (await bed.findRun(runId)).status === "PAUSED");
        }

        it("pauses the run before any agent when the project already spent the day", async () => {
            await useDailyBudgetUsd(CONFIGURED_OPUS_PRICE.inputPerMTok);
            await bed.usage.record(
                buildNewUsageRecord({ runId: "run_anterior", usage: DEV_USAGE }),
            );

            const started = await bed.startRun(flowId);
            await runUntilPaused(started.id);

            await expect(bed.findRun(started.id)).resolves.toMatchObject({ pauseReason: "budget" });
            expect(bed.runtime.calls.filter((call) => call.kind === "headless")).toEqual([]);
        });

        it("counts the spending of the run once when its budget is raised", async () => {
            await useDailyBudgetUsd(CONFIGURED_OPUS_PRICE.inputPerMTok);
            const started = await bed.startRun(flowId);
            await runUntilPaused(started.id);

            await useDailyBudgetUsd(2 * CONFIGURED_OPUS_PRICE.inputPerMTok);
            await bed.executor.raiseRunBudget(started.id, undefined);
            const finished = await bed.runUntilFinished(started.id);

            expect(finished.status).toBe("SUCCEEDED");
        });
    });
});
