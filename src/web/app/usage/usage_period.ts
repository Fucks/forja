import { addDays, startOfLocalDay } from "@/lib/local_day.js";

export const USAGE_PERIOD_CHOICES = ["today", "7d", "30d", "custom"] as const;

export type UsagePeriodChoice = (typeof USAGE_PERIOD_CHOICES)[number];

export interface DayRange {
    firstDay: string;
    lastDay: string;
}

export interface UsagePeriod {
    from: string;
    to: string;
    days: string[];
}

export const DEFAULT_PERIOD_DAY_COUNT = 7;

const DAY_COUNTS: Record<Exclude<UsagePeriodChoice, "custom">, number> = {
    today: 1,
    "7d": DEFAULT_PERIOD_DAY_COUNT,
    "30d": 30,
};

export function dayRangeOfChoice(
    choice: UsagePeriodChoice,
    { today, customRange }: { today: string; customRange: DayRange },
): DayRange {
    if (choice === "custom") {
        return customRange;
    }

    return dayRangeEndingOn(today, DAY_COUNTS[choice]);
}

export function dayRangeEndingOn(today: string, dayCount: number): DayRange {
    return { firstDay: addDays(today, 1 - dayCount), lastDay: today };
}

// The server counts the usage from `from` up to before `to`, so `to` is the start of the next day.
export function toUsagePeriod(range: DayRange, timeZone: string): UsagePeriod {
    return {
        from: startOfLocalDay(range.firstDay, timeZone).toISOString(),
        to: startOfLocalDay(addDays(range.lastDay, 1), timeZone).toISOString(),
        days: listDays(range),
    };
}

function listDays({ firstDay, lastDay }: DayRange): string[] {
    const days: string[] = [];
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
        days.push(day);
    }

    return days;
}
