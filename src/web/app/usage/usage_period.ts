import { addDays, startOfLocalDay } from "@/lib/local_day.js";

export interface DayRange {
    firstDay: string;
    lastDay: string;
}

export interface UsagePeriod {
    from: string;
    to: string;
    days: string[];
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
