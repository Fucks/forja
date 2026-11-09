import {
    addUsage,
    budgetTokensOf,
    NO_USAGE,
    type RunBudget,
    type UsageTotals,
} from "@/engine/budgets.js";
import type { UsageService } from "@/server/usage/usage_service.js";
import type { ProjectSettings } from "@/shared/settings_types.js";

export const BUDGET_EXCEEDED_ACTION = "pause";

interface RunOfProject {
    id: string;
    projectId: string;
}

export async function loadDailyBudget(
    usage: UsageService,
    settings: ProjectSettings,
    run: RunOfProject,
): Promise<RunBudget | undefined> {
    if (settings.dailyBudgetUsd === null) {
        return undefined;
    }

    const spent = await spentTodayByOtherRuns(usage, settings.timezone, run);

    return {
        daily: {
            maxCostUsd: settings.dailyBudgetUsd,
            alreadySpentUsd: spent.costUsd,
            alreadySpentTokens: spent.tokens,
        },
        onExceeded: BUDGET_EXCEEDED_ACTION,
    };
}

// The scheduler adds the spending of the run itself to the day, so it is taken out here; a run
// that resumes after a restart or a raised budget would be counted twice otherwise.
async function spentTodayByOtherRuns(
    usage: UsageService,
    timezone: string,
    run: RunOfProject,
): Promise<UsageTotals> {
    const [spentToday, recordsOfRun] = await Promise.all([
        usage.todaySpent(run.projectId, timezone),
        usage.forRun(run.id),
    ]);
    const spentByRun = recordsOfRun
        .map((record) => ({
            costUsd: record.costUsd,
            tokens: budgetTokensOf(record.usage),
        }))
        .reduce(addUsage, NO_USAGE);

    return {
        costUsd: Math.max(0, spentToday.costUsd - spentByRun.costUsd),
        tokens: Math.max(0, spentToday.tokens - spentByRun.tokens),
    };
}
