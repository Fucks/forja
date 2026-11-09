import { newId } from "@/lib/ids.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { FlowRepository } from "@/server/flows/flow_repository.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { DEFAULT_MODEL_PRICES, estimateCostUsd } from "@/server/usage/model_prices.js";
import { UsageRepository } from "@/server/usage/usage_repository.js";
import { createUsageService, type UsageService } from "@/server/usage/usage_service.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import type { ModelPrice, UsageGroupBy, UsageQuery } from "@/shared/usage_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildWorkItem } from "@/test/factories/work_item_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { buildNewUsageRecord, buildTokenUsage } from "@/test/factories/usage_record_factory.js";
import { createTestDb } from "@/test/test_db.js";

const ONE_MILLION = 1_000_000;
const RECORDED_AT = new Date("2026-11-09T15:00:00.000Z");
const CONFIGURED_OPUS_PRICE: ModelPrice = {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheReadPerMTok: 0.3,
    cacheWritePerMTok: 3.75,
};
const ONLY_INPUT_TOKENS = buildTokenUsage({ inputTokens: ONE_MILLION, outputTokens: 0 });
const PROJECT_ID = "prj_forja";
const ONE_HOUR_MS = 60 * 60 * 1_000;
const WHOLE_NOVEMBER = {
    from: new Date("2026-11-01T00:00:00.000Z"),
    to: new Date("2026-12-01T00:00:00.000Z"),
};

describe("UsageService", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let modelPrices: Record<string, ModelPrice>;
    let projectTimezone: string;
    let service: UsageService;

    beforeEach(() => {
        database = createTestDb();
        clock = new FakeClock(RECORDED_AT);
        modelPrices = {};
        projectTimezone = "UTC";
        service = createUsageService({
            repo: new UsageRepository(database.db),
            clock,
            newId,
            modelPrices: () => Promise.resolve(modelPrices),
            timezoneOf: () => Promise.resolve(projectTimezone),
        });
    });

    afterEach(() => {
        database.close();
    });

    describe("record", () => {
        it("charges 1 M input tokens of opus at the configured price", async () => {
            modelPrices = { opus: CONFIGURED_OPUS_PRICE };

            const record = await service.record(buildNewUsageRecord({ usage: ONLY_INPUT_TOKENS }));

            expect(record.costUsd).toBe(CONFIGURED_OPUS_PRICE.inputPerMTok);
            expect(record.priceEstimated).toBe(false);
        });

        it("charges the default price of the model family when none is configured", async () => {
            const record = await service.record(
                buildNewUsageRecord({ model: "claude-sonnet-5-5", usage: ONLY_INPUT_TOKENS }),
            );

            expect(record.costUsd).toBe(DEFAULT_MODEL_PRICES.sonnet.inputPerMTok);
        });

        it("marks the price of an unknown model as estimated", async () => {
            const record = await service.record(buildNewUsageRecord({ model: "modelo-novo" }));

            expect(record.priceEstimated).toBe(true);
        });

        it("stamps the record with a usage id and the current time", async () => {
            const record = await service.record(buildNewUsageRecord());

            expect(record.id).toMatch(/^usg_/);
            expect(record.at).toBe(RECORDED_AT.toISOString());
        });

        it("keeps the cost of old records when the prices change", async () => {
            const recorded = await service.record(
                buildNewUsageRecord({ runId: "run_a", usage: ONLY_INPUT_TOKENS }),
            );

            modelPrices = { opus: CONFIGURED_OPUS_PRICE };

            const [stored] = await service.forRun("run_a");
            expect(stored?.costUsd).toBe(recorded.costUsd);
        });
    });

    describe("forRun", () => {
        it("lists the records of the run in the order they were recorded", async () => {
            const first = await service.record(buildNewUsageRecord({ nodeRunId: "nrn_1" }));
            clock.advance(1_000);
            const second = await service.record(
                buildNewUsageRecord({ nodeRunId: "nrn_2", workItemId: undefined }),
            );
            await service.record(buildNewUsageRecord({ runId: "run_outra" }));

            const records = await service.forRun(first.runId);

            expect(records).toEqual([first, second]);
        });
    });

    describe("aggregate", () => {
        function aggregate(groupBy: UsageGroupBy, overrides: Partial<UsageQuery> = {}) {
            return service.aggregate({
                projectId: PROJECT_ID,
                ...WHOLE_NOVEMBER,
                groupBy,
                ...overrides,
            });
        }

        async function recordAt(at: Date, overrides: Parameters<typeof buildNewUsageRecord>[0]) {
            clock.set(at);
            return service.record(buildNewUsageRecord(overrides));
        }

        it("sums the tokens and the cost of each flow, labeled by the flow name", async () => {
            insertFlow("flw_entrega", "Entrega");
            await service.record(
                buildNewUsageRecord({ flowId: "flw_entrega", nodeRunId: "nrn_1" }),
            );
            await service.record(
                buildNewUsageRecord({ flowId: "flw_entrega", nodeRunId: "nrn_2" }),
            );

            const [entrega] = await aggregate("flow");

            const single = buildNewUsageRecord().usage;
            expect(entrega).toMatchObject({
                key: "flw_entrega",
                label: "Entrega",
                inputTokens: 2 * single.inputTokens,
                outputTokens: 2 * single.outputTokens,
                cacheReadTokens: 2 * single.cacheReadInputTokens,
                nodeRuns: 2,
            });
            expect(entrega?.costUsd).toBeCloseTo(
                2 * estimateCostUsd(single, DEFAULT_MODEL_PRICES.opus),
            );
        });

        it.each<{ groupBy: UsageGroupBy; field: "nodeId" | "model" | "runId" }>([
            { groupBy: "node", field: "nodeId" },
            { groupBy: "model", field: "model" },
            { groupBy: "run", field: "runId" },
        ])("groups by $groupBy, labeled by the $field itself", async ({ groupBy, field }) => {
            await service.record(buildNewUsageRecord({ [field]: "b" }));
            await service.record(buildNewUsageRecord({ [field]: "a" }));
            await service.record(buildNewUsageRecord({ [field]: "a" }));

            const groups = await aggregate(groupBy);

            expect(groups.map(({ key, label, nodeRuns }) => ({ key, label, nodeRuns }))).toEqual([
                { key: "a", label: "a", nodeRuns: 1 },
                { key: "b", label: "b", nodeRuns: 1 },
            ]);
        });

        it("labels the items by their title and gathers the usage without item", async () => {
            insertWorkItem("itm_issue7", "Issue 7");
            await service.record(buildNewUsageRecord({ workItemId: "itm_issue7" }));
            await service.record(buildNewUsageRecord({ workItemId: undefined }));

            const groups = await aggregate("item");

            expect(groups.map(({ key, label }) => ({ key, label }))).toEqual([
                { key: "", label: "Sem item" },
                { key: "itm_issue7", label: "Issue 7" },
            ]);
        });

        it("groups by day in order", async () => {
            await recordAt(new Date("2026-11-10T09:00:00Z"), {});
            await recordAt(new Date("2026-11-09T09:00:00Z"), {});

            const groups = await aggregate("day");

            expect(groups.map(({ key, label }) => ({ key, label }))).toEqual([
                { key: "2026-11-09", label: "2026-11-09" },
                { key: "2026-11-10", label: "2026-11-10" },
            ]);
        });

        it("groups by the day of the project time zone", async () => {
            projectTimezone = "America/Sao_Paulo";
            await recordAt(new Date("2026-11-10T01:30:00Z"), {});
            await recordAt(new Date("2026-11-10T03:30:00Z"), {});

            const groups = await aggregate("day");

            expect(groups.map(({ key }) => key)).toEqual(["2026-11-09", "2026-11-10"]);
        });

        it("counts only the usage from the start of the period up to before its end", async () => {
            await recordAt(WHOLE_NOVEMBER.from, { nodeRunId: "nrn_first" });
            await recordAt(new Date(WHOLE_NOVEMBER.to.getTime() - ONE_HOUR_MS), {
                nodeRunId: "nrn_last",
            });
            await recordAt(WHOLE_NOVEMBER.to, { nodeRunId: "nrn_december" });

            const [all] = await aggregate("model");

            expect(all?.nodeRuns).toBe(2);
        });

        it("counts only the usage of the project", async () => {
            await service.record(buildNewUsageRecord({ nodeRunId: "nrn_1" }));
            await service.record(
                buildNewUsageRecord({ projectId: "prj_outro", nodeRunId: "nrn_2" }),
            );

            const [all] = await aggregate("model");

            expect(all?.nodeRuns).toBe(1);
        });

        it("counts only the usage of the flow when one is given", async () => {
            await service.record(buildNewUsageRecord({ flowId: "flw_entrega", nodeId: "dev" }));
            await service.record(buildNewUsageRecord({ flowId: "flw_triagem", nodeId: "tl" }));

            const groups = await aggregate("node", { flowId: "flw_entrega" });

            expect(groups.map(({ key }) => key)).toEqual(["dev"]);
        });

        it("answers no groups when nothing was spent in the period", async () => {
            await expect(aggregate("day")).resolves.toEqual([]);
        });
    });

    describe("todaySpent", () => {
        const NOW_IN_SAO_PAULO_EVENING = new Date("2026-11-10T01:30:00Z");

        it("sums the cost and the input and output tokens of today in the time zone", async () => {
            clock.set(new Date("2026-11-09T02:59:00Z"));
            await service.record(buildNewUsageRecord({ usage: ONLY_INPUT_TOKENS }));
            clock.set(new Date("2026-11-09T03:00:00Z"));
            const sinceMidnight = await service.record(buildNewUsageRecord());
            clock.set(NOW_IN_SAO_PAULO_EVENING);
            const thisEvening = await service.record(buildNewUsageRecord());

            const spent = await service.todaySpent(PROJECT_ID, "America/Sao_Paulo");

            const tokensOfEach = buildTokenUsage().inputTokens + buildTokenUsage().outputTokens;
            expect(spent.tokens).toBe(2 * tokensOfEach);
            expect(spent.costUsd).toBeCloseTo(sinceMidnight.costUsd + thisEvening.costUsd);
        });

        it("leaves out the cache tokens and the other projects", async () => {
            clock.set(NOW_IN_SAO_PAULO_EVENING);
            await service.record(
                buildNewUsageRecord({
                    usage: buildTokenUsage({
                        inputTokens: 10,
                        outputTokens: 5,
                        cacheReadInputTokens: 1_000,
                        cacheCreationInputTokens: 1_000,
                    }),
                }),
            );
            await service.record(buildNewUsageRecord({ projectId: "prj_outro" }));

            const spent = await service.todaySpent(PROJECT_ID, "America/Sao_Paulo");

            expect(spent.tokens).toBe(15);
        });

        it("answers nothing spent on a day without usage", async () => {
            await expect(service.todaySpent(PROJECT_ID, "UTC")).resolves.toEqual({
                costUsd: 0,
                tokens: 0,
            });
        });
    });

    function insertFlow(id: string, name: string): void {
        insertProject();
        new FlowRepository(database.db).insert({
            id,
            projectId: PROJECT_ID,
            name,
            graph: buildCanonicalFlow(),
            createdAt: RECORDED_AT.toISOString(),
        });
    }

    function insertWorkItem(id: string, title: string): void {
        insertProject();
        new WorkItemRepository(database.db).insert(buildWorkItem({ id, title }));
    }

    function insertProject(): void {
        new ProjectRepository(database.db).insert(buildProject({ id: PROJECT_ID }));
    }
});
