import type { UseQueryResult } from "@tanstack/react-query";
import { CircleAlert, X } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";
import { useParams } from "react-router";

import { systemClock } from "@/lib/clock.js";
import { localDayOf } from "@/lib/local_day.js";
import type { ProjectSettings } from "@/shared/settings_types.js";
import { PageTitle } from "@/web/app/page_title.js";
import { useProjectSettings } from "@/web/app/projects/use_settings.js";
import type { ApiError } from "@/web/api/api_client.js";
import { useUsage } from "@/web/app/usage/use_usage.js";
import type { UsageRow } from "@/web/app/usage/use_usage.js";
import { UsageFiltersBar } from "@/web/app/usage/usage_filters_bar.js";
import type { UsageFilters } from "@/web/app/usage/usage_filters_bar.js";
import { USAGE_GROUP_LABELS } from "@/web/app/usage/usage_group_labels.js";
import {
    dayRangeEndingOn,
    dayRangeOfChoice,
    DEFAULT_PERIOD_DAY_COUNT,
    toUsagePeriod,
} from "@/web/app/usage/usage_period.js";
import type { UsagePeriod } from "@/web/app/usage/usage_period.js";
import { UsageChart } from "@/web/app/usage/usage_chart.js";
import { UsageTable } from "@/web/app/usage/usage_table.js";
import { UsageTodayCard } from "@/web/app/usage/usage_today_card.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

export function UsagePage(): JSX.Element {
    const { projectId = "" } = useParams();

    return (
        <div className="flex flex-col gap-4">
            <PageTitle>Uso</PageTitle>
            <UsageOfProject projectId={projectId} />
        </div>
    );
}

// The days of the period are those of the project time zone, the same the server groups by.
function UsageOfProject({ projectId }: { projectId: string }): JSX.Element {
    const settingsQuery = useProjectSettings(projectId);

    if (settingsQuery.isPending) {
        return <Skeleton className="h-64" />;
    }
    if (settingsQuery.isError) {
        return <LoadError message={settingsQuery.error.message} />;
    }

    return <UsageDashboard projectId={projectId} settings={settingsQuery.data} />;
}

function UsageDashboard({
    projectId,
    settings,
}: {
    projectId: string;
    settings: ProjectSettings;
}): JSX.Element {
    const today = localDayOf(systemClock.now(), settings.timezone);
    const [filters, setFilters] = useState<UsageFilters>(() => ({
        periodChoice: "7d",
        customRange: dayRangeEndingOn(today, DEFAULT_PERIOD_DAY_COUNT),
        groupBy: "day",
    }));
    const todayPeriod = toUsagePeriod({ firstDay: today, lastDay: today }, settings.timezone);
    const period = toUsagePeriod(
        dayRangeOfChoice(filters.periodChoice, { today, customRange: filters.customRange }),
        settings.timezone,
    );

    return (
        <>
            <UsageFiltersBar filters={filters} onChange={setFilters} />
            {filters.nodeId !== undefined && (
                <NodeFilterNotice
                    nodeId={filters.nodeId}
                    onClear={() => setFilters({ ...filters, nodeId: undefined })}
                />
            )}
            <div className="flex flex-wrap items-start gap-4">
                <UsageTodayCard
                    projectId={projectId}
                    today={todayPeriod}
                    dailyBudgetUsd={settings.dailyBudgetUsd}
                />
                <div className="min-w-80 flex-1">
                    <UsageChartSection
                        projectId={projectId}
                        period={period}
                        nodeId={filters.nodeId}
                    />
                </div>
            </div>
            <UsageTableSection
                projectId={projectId}
                period={period}
                filters={filters}
                onSelectNode={(nodeId) => setFilters({ ...filters, nodeId })}
            />
        </>
    );
}

function NodeFilterNotice({
    nodeId,
    onClear,
}: {
    nodeId: string;
    onClear: () => void;
}): JSX.Element {
    return (
        <div className="flex items-center gap-2 text-sm">
            <span>Filtrando pelo nó {nodeId}</span>
            <Button size="sm" onClick={onClear}>
                <X aria-hidden className="size-3.5" />
                Limpar filtro
            </Button>
        </div>
    );
}

function UsageChartSection({
    projectId,
    period,
    nodeId,
}: {
    projectId: string;
    period: UsagePeriod;
    nodeId?: string;
}): JSX.Element {
    const dailyQuery = useUsage(projectId, {
        from: period.from,
        to: period.to,
        groupBy: "day",
        nodeId,
    });

    if (dailyQuery.isPending) {
        return <Skeleton className="h-56" />;
    }
    if (dailyQuery.isError) {
        return <LoadError message={dailyQuery.error.message} />;
    }

    return <UsageChart days={period.days} rows={dailyQuery.data} />;
}

function UsageTableSection({
    projectId,
    period,
    filters,
    onSelectNode,
}: {
    projectId: string;
    period: UsagePeriod;
    filters: UsageFilters;
    onSelectNode: (nodeId: string) => void;
}): JSX.Element {
    const { groupBy, nodeId } = filters;
    const usageQuery = useUsage(projectId, { from: period.from, to: period.to, groupBy, nodeId });

    return (
        <section aria-label={`Por ${USAGE_GROUP_LABELS[groupBy].toLowerCase()}`}>
            <UsageTableContent query={usageQuery} groupBy={groupBy} onSelectNode={onSelectNode} />
        </section>
    );
}

function UsageTableContent({
    query,
    groupBy,
    onSelectNode,
}: {
    query: UseQueryResult<UsageRow[], ApiError>;
    groupBy: UsageFilters["groupBy"];
    onSelectNode: (nodeId: string) => void;
}): JSX.Element {
    if (query.isPending) {
        return <Skeleton className="h-24" />;
    }
    if (query.isError) {
        return <LoadError message={query.error.message} />;
    }
    if (query.data.length === 0) {
        return <p className="text-sm text-muted">Nenhum uso de tokens no período.</p>;
    }

    return <UsageTable rows={query.data} groupBy={groupBy} onSelectNode={onSelectNode} />;
}

function LoadError({ message }: { message: string }): JSX.Element {
    return (
        <EmptyState
            icon={CircleAlert}
            title="Não foi possível carregar o uso"
            description={message}
        />
    );
}
