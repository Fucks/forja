import type { JSX } from "react";

import { USAGE_GROUP_BYS } from "@/shared/usage_types.js";
import type { UsageGroupBy } from "@/shared/usage_types.js";
import { USAGE_GROUP_LABELS } from "@/web/app/usage/usage_group_labels.js";
import type { DayRange, UsagePeriodChoice } from "@/web/app/usage/usage_period.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { SegmentedControl } from "@/web/components/ui/segmented_control.js";
import { Select } from "@/web/components/ui/select.js";

export interface UsageFilters {
    periodChoice: UsagePeriodChoice;
    customRange: DayRange;
    groupBy: UsageGroupBy;
    nodeId?: string;
}

const PERIOD_OPTIONS: { value: UsagePeriodChoice; label: string }[] = [
    { value: "today", label: "Hoje" },
    { value: "7d", label: "7 dias" },
    { value: "30d", label: "30 dias" },
    { value: "custom", label: "Personalizado" },
];

const GROUP_BY_OPTIONS = USAGE_GROUP_BYS.map((groupBy) => ({
    value: groupBy,
    label: USAGE_GROUP_LABELS[groupBy],
}));

export function UsageFiltersBar({
    filters,
    onChange,
}: {
    filters: UsageFilters;
    onChange: (filters: UsageFilters) => void;
}): JSX.Element {
    return (
        <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
                <span aria-hidden className="text-sm font-medium">
                    Período
                </span>
                <SegmentedControl
                    label="Período"
                    value={filters.periodChoice}
                    onChange={(periodChoice) => onChange({ ...filters, periodChoice })}
                    options={PERIOD_OPTIONS}
                />
            </div>
            {filters.periodChoice === "custom" && (
                <CustomRangeFields
                    range={filters.customRange}
                    onChange={(customRange) => onChange({ ...filters, customRange })}
                />
            )}
            <Field label="Agrupar por" htmlFor="usage-group-by">
                <Select
                    value={filters.groupBy}
                    onChange={(groupBy) => onChange({ ...filters, groupBy })}
                    options={GROUP_BY_OPTIONS}
                />
            </Field>
        </div>
    );
}

// A change that leaves the range empty or reversed is ignored, so the period is always valid.
function CustomRangeFields({
    range,
    onChange,
}: {
    range: DayRange;
    onChange: (range: DayRange) => void;
}): JSX.Element {
    const changeRange = (changedRange: DayRange): void => {
        if (isValidRange(changedRange)) {
            onChange(changedRange);
        }
    };

    return (
        <>
            <Field label="De" htmlFor="usage-first-day">
                <Input
                    type="date"
                    value={range.firstDay}
                    max={range.lastDay}
                    onChange={(event) => changeRange({ ...range, firstDay: event.target.value })}
                />
            </Field>
            <Field label="Até" htmlFor="usage-last-day">
                <Input
                    type="date"
                    value={range.lastDay}
                    min={range.firstDay}
                    onChange={(event) => changeRange({ ...range, lastDay: event.target.value })}
                />
            </Field>
        </>
    );
}

function isValidRange({ firstDay, lastDay }: DayRange): boolean {
    return firstDay !== "" && lastDay !== "" && firstDay <= lastDay;
}
