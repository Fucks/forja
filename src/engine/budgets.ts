export interface BudgetLimit {
    maxCostUsd?: number;
    maxTokens?: number;
}

export interface DailyBudgetLimit extends BudgetLimit {
    alreadySpentUsd: number;
    alreadySpentTokens: number;
}

export type BudgetExceededAction = "pause" | "fail";

export interface RunBudget {
    run?: BudgetLimit;
    perNode?: Record<string, BudgetLimit>;
    // The spending of the day before this run started is reported by the executor.
    daily?: DailyBudgetLimit;
    onExceeded: BudgetExceededAction;
}

// tokens = input + output; cache tokens do not count.
export interface UsageTotals {
    costUsd: number;
    tokens: number;
}

export type BudgetScope = "run" | "node" | "daily";

export interface BudgetTotals {
    run: UsageTotals;
    byNode: Record<string, UsageTotals>;
    // Already includes the spending of the day before this run.
    today: UsageTotals;
}

export type BudgetCheck =
    { allowed: true } | { allowed: false; scope: BudgetScope; limit: BudgetLimit };

interface ScopedLimit {
    scope: BudgetScope;
    limit: BudgetLimit;
    spent: UsageTotals;
}

type OptionalScopedLimit = Omit<ScopedLimit, "limit"> & { limit: BudgetLimit | undefined };

export const NO_USAGE: UsageTotals = { costUsd: 0, tokens: 0 };

export function checkBudget(budget: RunBudget, totals: BudgetTotals, nodeId: string): BudgetCheck {
    const reached = scopedLimitsOf(budget, totals, nodeId).find(({ limit, spent }) =>
        isLimitReached(limit, spent),
    );
    if (!reached) {
        return { allowed: true };
    }

    return { allowed: false, scope: reached.scope, limit: reached.limit };
}

export function addUsage(first: UsageTotals, second: UsageTotals): UsageTotals {
    return { costUsd: first.costUsd + second.costUsd, tokens: first.tokens + second.tokens };
}

// In the order the scopes are reported: run, node, daily.
function scopedLimitsOf(budget: RunBudget, totals: BudgetTotals, nodeId: string): ScopedLimit[] {
    const candidates: OptionalScopedLimit[] = [
        { scope: "run", limit: budget.run, spent: totals.run },
        {
            scope: "node",
            limit: budget.perNode?.[nodeId],
            spent: totals.byNode[nodeId] ?? NO_USAGE,
        },
        { scope: "daily", limit: budget.daily, spent: totals.today },
    ];

    return candidates.filter(hasLimit);
}

function hasLimit(candidate: OptionalScopedLimit): candidate is ScopedLimit {
    return candidate.limit !== undefined;
}

function isLimitReached(limit: BudgetLimit, spent: UsageTotals): boolean {
    return (
        isAmountReached(limit.maxCostUsd, spent.costUsd) ||
        isAmountReached(limit.maxTokens, spent.tokens)
    );
}

function isAmountReached(maxAmount: number | undefined, spentAmount: number): boolean {
    return maxAmount !== undefined && spentAmount >= maxAmount;
}
