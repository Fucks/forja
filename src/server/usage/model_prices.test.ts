import { DEFAULT_MODEL_PRICES, estimateCostUsd, priceFor } from "@/server/usage/model_prices.js";
import type { ModelPrice, TokenUsage } from "@/shared/usage_types.js";

const ONE_MILLION = 1_000_000;
const NO_TOKENS: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
};
const CUSTOM_PRICE: ModelPrice = {
    inputPerMTok: 1,
    outputPerMTok: 2,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 1.5,
};

describe("priceFor", () => {
    it("matches a full model id by its family", () => {
        const price = priceFor("claude-sonnet-5-5", {});

        expect(price).toEqual({ ...DEFAULT_MODEL_PRICES.sonnet, estimated: false });
    });

    it("matches the bare family alias", () => {
        expect(priceFor("haiku", {})).toEqual({ ...DEFAULT_MODEL_PRICES.haiku, estimated: false });
    });

    it("prefers the configured price of the family over the default", () => {
        const price = priceFor("claude-opus-5-5", { opus: CUSTOM_PRICE });

        expect(price).toEqual({ ...CUSTOM_PRICE, estimated: false });
    });

    it("prefers the price configured for the exact model over its family", () => {
        const opus5Price = { ...CUSTOM_PRICE, inputPerMTok: 5 };

        const price = priceFor("claude-opus-5", {
            "claude-opus-5": opus5Price,
            opus: CUSTOM_PRICE,
        });

        expect(price).toEqual({ ...opus5Price, estimated: false });
    });

    it("matches a configured model id that prefixes the model", () => {
        const price = priceFor("claude-opus-5-5-preview", { "claude-opus-5-5": CUSTOM_PRICE });

        expect(price).toEqual({ ...CUSTOM_PRICE, estimated: false });
    });

    it("estimates an unknown model with the opus price", () => {
        const price = priceFor("modelo-novo", {});

        expect(price).toEqual({ ...DEFAULT_MODEL_PRICES.opus, estimated: true });
    });

    it("estimates an unknown model with the configured opus price", () => {
        expect(priceFor("modelo-novo", { opus: CUSTOM_PRICE })).toEqual({
            ...CUSTOM_PRICE,
            estimated: true,
        });
    });
});

describe("estimateCostUsd", () => {
    it("charges each kind of token by its price per million", () => {
        const usage: TokenUsage = {
            inputTokens: ONE_MILLION,
            outputTokens: ONE_MILLION / 2,
            cacheReadInputTokens: 2 * ONE_MILLION,
            cacheCreationInputTokens: ONE_MILLION,
        };

        const costUsd = estimateCostUsd(usage, CUSTOM_PRICE);

        expect(costUsd).toBeCloseTo(1 + 1 + 1 + 1.5);
    });

    it("costs nothing without tokens", () => {
        expect(estimateCostUsd(NO_TOKENS, CUSTOM_PRICE)).toBe(0);
    });
});
