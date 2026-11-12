import { X } from "lucide-react";
import type { JSX } from "react";

import { USAGE_GROUP_BYS } from "@/shared/usage_types.js";
import type { UsageGroupBy } from "@/shared/usage_types.js";
import { USAGE_GROUP_LABELS } from "@/web/app/usage/usage_group_labels.js";
import { USAGE_PERIOD_CHOICES } from "@/web/app/usage/usage_period.js";
import type { DayRange, UsagePeriodChoice } from "@/web/app/usage/usage_period.js";
import { Button } from "@/web/components/ui/button.js";
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

const PERIOD_LABELS: Record<UsagePeriodChoice, string> = {
    today: "Hoje",
    "7d": "7 dias",
    "30d": "30 dias",
    custom: "Personalizado",
};

const PERIOD_OPTIONS = USAGE_PERIOD_CHOICES.map((choice) => ({
    value: choice,
    label: PERIOD_LABELS[choice],
}));

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

export function NodeFilterNotice({
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
