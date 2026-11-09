import type { ModelPrice, TokenUsage } from "@/shared/usage_types.js";

const MODEL_FAMILIES = ["opus", "sonnet", "haiku", "fable"] as const;

type ModelFamily = (typeof MODEL_FAMILIES)[number];

const FALLBACK_FAMILY: ModelFamily = "opus";
const TOKENS_PER_MTOK = 1_000_000;
const MODEL_ID_SEPARATORS = /[^a-z0-9]+/;

// USD per million tokens of the current model of each family. The values must be checked against
// https://www.anthropic.com/pricing before trusting the costs (human task #92); the user can
// override them in the global settings.
export const DEFAULT_MODEL_PRICES: Record<ModelFamily, ModelPrice> = {
    opus: { inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2, cacheWritePerMTok: 5 },
    sonnet: { inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.2, cacheWritePerMTok: 2.5 },
    haiku: {
        inputPerMTok: 0.1,
        outputPerMTok: 0.5,
        cacheReadPerMTok: 0.01,
        cacheWritePerMTok: 0.125,
    },
    fable: { inputPerMTok: 10, outputPerMTok: 50, cacheReadPerMTok: 0.25, cacheWritePerMTok: 12.5 },
};

export interface PricedModel extends ModelPrice {
    // No price matched the model, so the opus price stands in for it.
    estimated: boolean;
}

// A configured model id wins over the family; among them, the longest id that prefixes the model.
export function priceFor(model: string, overrides: Record<string, ModelPrice>): PricedModel {
    const prices: Record<string, ModelPrice> = { ...DEFAULT_MODEL_PRICES, ...overrides };
    const price = findPriceByModelPrefix(model, prices) ?? findPriceByFamily(model, prices);
    if (price) {
        return { ...price, estimated: false };
    }

    const fallbackPrice = overrides[FALLBACK_FAMILY] ?? DEFAULT_MODEL_PRICES[FALLBACK_FAMILY];
    return { ...fallbackPrice, estimated: true };
}

export function estimateCostUsd(usage: TokenUsage, price: ModelPrice): number {
    return (
        costOf(usage.inputTokens, price.inputPerMTok) +
        costOf(usage.outputTokens, price.outputPerMTok) +
        costOf(usage.cacheReadInputTokens, price.cacheReadPerMTok) +
        costOf(usage.cacheCreationInputTokens, price.cacheWritePerMTok)
    );
}

function costOf(tokens: number, pricePerMTok: number): number {
    return (tokens * pricePerMTok) / TOKENS_PER_MTOK;
}

function findPriceByModelPrefix(
    model: string,
    prices: Record<string, ModelPrice>,
): ModelPrice | undefined {
    const longestPrefix = Object.keys(prices)
        .filter((priceKey) => model.startsWith(priceKey))
        .sort((a, b) => b.length - a.length)
        .at(0);

    return longestPrefix === undefined ? undefined : prices[longestPrefix];
}

function findPriceByFamily(
    model: string,
    prices: Record<string, ModelPrice>,
): ModelPrice | undefined {
    const modelIdParts = model.toLowerCase().split(MODEL_ID_SEPARATORS);
    const family = MODEL_FAMILIES.find((candidate) => modelIdParts.includes(candidate));

    return family === undefined ? undefined : prices[family];
}
