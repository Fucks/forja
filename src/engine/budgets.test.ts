import { checkBudget, type RunBudget, type UsageTotals } from "@/engine/budgets.js";

const NOTHING_SPENT: UsageTotals = { costUsd: 0, tokens: 0 };

interface SpendingSoFar {
    run?: UsageTotals;
    byNode?: Record<string, UsageTotals>;
    today?: UsageTotals;
}

function totalsOf(spending: SpendingSoFar) {
    return {
        run: spending.run ?? NOTHING_SPENT,
        byNode: spending.byNode ?? {},
        today: spending.today ?? NOTHING_SPENT,
    };
}

describe("checkBudget: run scope", () => {
    it("allows the start while the run costs less than its limit", () => {
        const budget: RunBudget = { run: { maxCostUsd: 1 }, onExceeded: "pause" };

        const result = checkBudget(budget, totalsOf({ run: { costUsd: 0.8, tokens: 0 } }), "a");

        expect(result).toEqual({ allowed: true });
    });

    it("refuses the start once the run cost reaches its limit", () => {
        const budget: RunBudget = { run: { maxCostUsd: 1 }, onExceeded: "pause" };

        const result = checkBudget(budget, totalsOf({ run: { costUsd: 1.2, tokens: 0 } }), "a");

        expect(result).toEqual({ allowed: false, scope: "run", limit: { maxCostUsd: 1 } });
    });

    it("refuses the start once the run tokens reach their limit", () => {
        const budget: RunBudget = { run: { maxTokens: 10_000 }, onExceeded: "pause" };

        const result = checkBudget(budget, totalsOf({ run: { costUsd: 0, tokens: 10_000 } }), "a");

        expect(result).toEqual({ allowed: false, scope: "run", limit: { maxTokens: 10_000 } });
    });

    it("allows any spending when the budget has no limits", () => {
        const budget: RunBudget = { run: {}, onExceeded: "pause" };
        const hugeSpending = { costUsd: 1_000, tokens: 1_000_000 };

        const result = checkBudget(
            budget,
            totalsOf({ run: hugeSpending, byNode: { a: hugeSpending }, today: hugeSpending }),
            "a",
        );

        expect(result).toEqual({ allowed: true });
    });
});

describe("checkBudget: node scope", () => {
    it("refuses the start of the node whose spending reached its limit", () => {
        const budget: RunBudget = { perNode: { a: { maxCostUsd: 0.5 } }, onExceeded: "pause" };

        const result = checkBudget(
            budget,
            totalsOf({ byNode: { a: { costUsd: 0.5, tokens: 0 } } }),
            "a",
        );

        expect(result).toEqual({ allowed: false, scope: "node", limit: { maxCostUsd: 0.5 } });
    });

    it("allows the other nodes when one node reached its limit", () => {
        const budget: RunBudget = { perNode: { a: { maxCostUsd: 0.5 } }, onExceeded: "pause" };

        const result = checkBudget(
            budget,
            totalsOf({ byNode: { a: { costUsd: 0.5, tokens: 0 } } }),
            "b",
        );

        expect(result).toEqual({ allowed: true });
    });

    it("allows a node with a limit that has not spent anything yet", () => {
        const budget: RunBudget = { perNode: { a: { maxTokens: 100 } }, onExceeded: "pause" };

        const result = checkBudget(budget, totalsOf({}), "a");

        expect(result).toEqual({ allowed: true });
    });
});

describe("checkBudget: daily scope", () => {
    it("refuses the start once the spending of the day reaches the daily limit", () => {
        const daily = { maxCostUsd: 5, alreadySpentUsd: 4.5, alreadySpentTokens: 0 };
        const budget: RunBudget = { daily, onExceeded: "fail" };

        const result = checkBudget(budget, totalsOf({ today: { costUsd: 5, tokens: 0 } }), "a");

        expect(result).toEqual({ allowed: false, scope: "daily", limit: daily });
    });

    it("refuses the start once the tokens of the day reach the daily limit", () => {
        const daily = { maxTokens: 50_000, alreadySpentUsd: 0, alreadySpentTokens: 40_000 };
        const budget: RunBudget = { daily, onExceeded: "pause" };

        const result = checkBudget(
            budget,
            totalsOf({ today: { costUsd: 0, tokens: 50_000 } }),
            "a",
        );

        expect(result).toEqual({ allowed: false, scope: "daily", limit: daily });
    });

    it("reports the run scope first when several limits are reached", () => {
        const budget: RunBudget = {
            run: { maxCostUsd: 1 },
            perNode: { a: { maxCostUsd: 1 } },
            daily: { maxCostUsd: 1, alreadySpentUsd: 0, alreadySpentTokens: 0 },
            onExceeded: "pause",
        };
        const spent = { costUsd: 1, tokens: 0 };

        const result = checkBudget(
            budget,
            totalsOf({ run: spent, byNode: { a: spent }, today: spent }),
            "a",
        );

        expect(result).toMatchObject({ allowed: false, scope: "run" });
    });
});
