import {
    addUsage,
    type BudgetExceededAction,
    type BudgetLimit,
    type BudgetScope,
    type BudgetTotals,
    checkBudget,
    NO_USAGE,
    type RunBudget,
    type UsageTotals,
} from "@/engine/budgets.js";
import type { NodeRunError } from "@/engine/node_run_state.js";

export interface BudgetBreach {
    scope: BudgetScope;
    limit: BudgetLimit;
    onExceeded: BudgetExceededAction;
}

const BUDGET_SCOPE_LABELS: Record<BudgetScope, string> = {
    run: "da run",
    node: "do nó",
    daily: "diário",
};

export class RunBudgetGuard {
    private readonly usageByNode: Map<string, UsageTotals>;

    constructor(
        private budget: RunBudget | undefined,
        usageByNode: Record<string, UsageTotals>,
    ) {
        this.usageByNode = new Map(Object.entries(usageByNode));
    }

    spentByNode(): Record<string, UsageTotals> {
        return Object.fromEntries(this.usageByNode);
    }

    recordUsage(nodeId: string, usage: UsageTotals): void {
        this.usageByNode.set(nodeId, addUsage(this.usageByNode.get(nodeId) ?? NO_USAGE, usage));
    }

    replaceBudget(budget: RunBudget): void {
        this.budget = budget;
    }

    // Undefined when the node may start.
    findBreachFor(nodeId: string): BudgetBreach | undefined {
        if (!this.budget) {
            return undefined;
        }

        const check = checkBudget(this.budget, this.spendingTotals(this.budget), nodeId);
        if (check.allowed) {
            return undefined;
        }

        return { scope: check.scope, limit: check.limit, onExceeded: this.budget.onExceeded };
    }

    private spendingTotals(budget: RunBudget): BudgetTotals {
        const runTotal = [...this.usageByNode.values()].reduce(addUsage, NO_USAGE);
        const spentTodayBeforeRun: UsageTotals = {
            costUsd: budget.daily?.alreadySpentUsd ?? 0,
            tokens: budget.daily?.alreadySpentTokens ?? 0,
        };

        return {
            run: runTotal,
            byNode: this.spentByNode(),
            today: addUsage(spentTodayBeforeRun, runTotal),
        };
    }
}

export function budgetExceededError(scope: BudgetScope): NodeRunError {
    return { kind: "budget", message: `Orçamento ${BUDGET_SCOPE_LABELS[scope]} atingido` };
}
