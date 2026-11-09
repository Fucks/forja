import { newId } from "@/lib/ids.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { DEFAULT_MODEL_PRICES } from "@/server/usage/model_prices.js";
import { UsageRepository } from "@/server/usage/usage_repository.js";
import { createUsageService, type UsageService } from "@/server/usage/usage_service.js";
import type { ModelPrice } from "@/shared/usage_types.js";
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

describe("UsageService", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let modelPrices: Record<string, ModelPrice>;
    let service: UsageService;

    beforeEach(() => {
        database = createTestDb();
        clock = new FakeClock(RECORDED_AT);
        modelPrices = {};
        service = createUsageService({
            repo: new UsageRepository(database.db),
            clock,
            newId,
            modelPrices: () => Promise.resolve(modelPrices),
            timezoneOf: () => Promise.resolve("UTC"),
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
});
