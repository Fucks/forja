import type { UseQueryResult } from "@tanstack/react-query";
import { clsx } from "clsx";
import { TriangleAlert } from "lucide-react";
import type { JSX } from "react";

import { formatTokens, formatUsd } from "@/lib/format.js";
import type { ApiError } from "@/web/api/api_client.js";
import { useUsage } from "@/web/app/usage/use_usage.js";
import type { UsageRow } from "@/web/app/usage/use_usage.js";
import type { UsagePeriod } from "@/web/app/usage/usage_period.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

const BUDGET_WARNING_PERCENT = 80;
const FULL_BUDGET_PERCENT = 100;

interface SpentToday {
    costUsd: number;
    tokens: number;
}

export function UsageTodayCard({
    projectId,
    today,
    dailyBudgetUsd,
}: {
    projectId: string;
    today: UsagePeriod;
    dailyBudgetUsd: number | null;
}): JSX.Element {
    const todayQuery = useUsage(projectId, { from: today.from, to: today.to, groupBy: "day" });

    return (
        <section
            aria-labelledby="usage-today-title"
            className="flex w-72 flex-col gap-2 rounded-md border border-border bg-surface p-4"
        >
            <h2 id="usage-today-title" className="text-sm font-medium text-muted">
                Hoje
            </h2>
            <TodayCardContent query={todayQuery} dailyBudgetUsd={dailyBudgetUsd} />
        </section>
    );
}

function TodayCardContent({
    query,
    dailyBudgetUsd,
}: {
    query: UseQueryResult<UsageRow[], ApiError>;
    dailyBudgetUsd: number | null;
}): JSX.Element {
    if (query.isPending) {
        return <Skeleton className="h-12" />;
    }
    if (query.isError) {
        return (
            <p role="alert" className="text-sm text-status-failed">
                {query.error.message}
            </p>
        );
    }

    return <TodaySpending spent={sumSpent(query.data)} dailyBudgetUsd={dailyBudgetUsd} />;
}

function TodaySpending({
    spent,
    dailyBudgetUsd,
}: {
    spent: SpentToday;
    dailyBudgetUsd: number | null;
}): JSX.Element {
    return (
        <>
            <p className="flex items-baseline gap-2">
                <span className="font-condensed text-2xl font-semibold">
                    {formatUsd(spent.costUsd)}
                </span>
                {dailyBudgetUsd !== null && (
                    <span className="text-muted">de {formatUsd(dailyBudgetUsd)}</span>
                )}
            </p>
            <p className="text-xs text-muted">{formatTokens(spent.tokens)} tokens</p>
            {dailyBudgetUsd === null ? (
                <p className="text-xs text-muted">Sem orçamento diário configurado.</p>
            ) : (
                <BudgetProgress spentUsd={spent.costUsd} budgetUsd={dailyBudgetUsd} />
            )}
        </>
    );
}

function BudgetProgress({
    spentUsd,
    budgetUsd,
}: {
    spentUsd: number;
    budgetUsd: number;
}): JSX.Element {
    const spentPercent = Math.round((spentUsd / budgetUsd) * FULL_BUDGET_PERCENT);
    const isNearTheLimit = spentPercent > BUDGET_WARNING_PERCENT;
    const filledPercent = Math.min(spentPercent, FULL_BUDGET_PERCENT);

    return (
        <div className="flex flex-col gap-1">
            <div
                role="progressbar"
                aria-label="Orçamento diário"
                aria-valuemin={0}
                aria-valuemax={FULL_BUDGET_PERCENT}
                aria-valuenow={filledPercent}
                className="h-2 overflow-hidden rounded-sm bg-surface-raised"
            >
                <div
                    className={clsx(
                        "h-full",
                        isNearTheLimit ? "bg-status-waiting-approval" : "bg-accent",
                    )}
                    style={{ width: `${filledPercent}%` }}
                />
            </div>
            {isNearTheLimit && (
                <p className="flex items-center gap-1 text-xs text-status-waiting-approval">
                    <TriangleAlert aria-hidden className="size-3.5" />
                    Acima de {BUDGET_WARNING_PERCENT}% do orçamento
                </p>
            )}
        </div>
    );
}

function sumSpent(rows: UsageRow[]): SpentToday {
    return rows.reduce(
        (spent, row) => ({
            costUsd: spent.costUsd + row.costUsd,
            tokens: spent.tokens + row.inputTokens + row.outputTokens,
        }),
        { costUsd: 0, tokens: 0 },
    );
}
