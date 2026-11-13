import { hostTimeZone } from "@/lib/local_day.js";

export type UsageLimitParse = { isLimit: false } | { isLimit: true; resetAt?: Date };

const USAGE_LIMIT_PATTERN =
    /usage limit|session limit|weekly limit|hour limit|limit reached|rate.?limit|429|overloaded|529/i;
const EPOCH_RESET_PATTERN = /limit reached\|(?<epochSeconds>\d{10})/i;
const CLOCK_RESET_PATTERN =
    /resets\s+(?:(?<monthName>[a-z]{3})\s+(?<dayOfMonth>\d{1,2}),?\s+)?(?<hour>\d{1,2})(?::(?<minute>\d{2}))?\s*(?<meridiem>am|pm)(?:\s*\((?<timeZone>[^)]+)\))?/i;

const MONTH_ABBREVIATIONS = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
];
const HOURS_PER_HALF_DAY = 12;
const MS_PER_SECOND = 1000;
const FALLBACK_TIME_ZONE = "UTC";

type TimeOfDay = { hour: number; minute: number };
type CalendarDay = { month: number; day: number };
type WallClock = { year: number } & CalendarDay & TimeOfDay;

export function parseUsageLimit(
    message: string,
    now: Date,
    defaultTimeZone: string = hostTimeZone(),
): UsageLimitParse {
    if (!USAGE_LIMIT_PATTERN.test(message)) {
        return { isLimit: false };
    }

    const resetAt = parseEpochReset(message) ?? parseClockReset(message, now, defaultTimeZone);
    if (!resetAt) {
        return { isLimit: true };
    }

    return { isLimit: true, resetAt };
}

function parseEpochReset(message: string): Date | undefined {
    const epochSeconds = EPOCH_RESET_PATTERN.exec(message)?.groups?.epochSeconds;
    if (!epochSeconds) {
        return undefined;
    }

    return new Date(Number(epochSeconds) * MS_PER_SECOND);
}

function parseClockReset(message: string, now: Date, defaultTimeZone: string): Date | undefined {
    const groups = CLOCK_RESET_PATTERN.exec(message)?.groups;
    if (!groups?.hour || !groups.meridiem) {
        return undefined;
    }

    const timeZone = chooseValidTimeZone([groups.timeZone?.trim(), defaultTimeZone]);
    const timeOfDay: TimeOfDay = {
        hour: to24Hour(Number(groups.hour), groups.meridiem),
        minute: groups.minute ? Number(groups.minute) : 0,
    };
    const calendarDay = parseCalendarDay(groups.monthName, groups.dayOfMonth);
    if (!calendarDay) {
        return nextOccurrenceOfTime(timeOfDay, now, timeZone);
    }

    return nextOccurrenceOfDay(calendarDay, timeOfDay, now, timeZone);
}

function chooseValidTimeZone(candidates: (string | undefined)[]): string {
    const validTimeZone = candidates.find(
        (candidate) => candidate !== undefined && isValidTimeZone(candidate),
    );
    return validTimeZone ?? FALLBACK_TIME_ZONE;
}

function isValidTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return true;
    } catch {
        return false;
    }
}

function to24Hour(hourOnTwelveHourClock: number, meridiem: string): number {
    const hoursIntoHalfDay = hourOnTwelveHourClock % HOURS_PER_HALF_DAY;
    const isAfternoon = meridiem.toLowerCase() === "pm";
    return isAfternoon ? hoursIntoHalfDay + HOURS_PER_HALF_DAY : hoursIntoHalfDay;
}

function parseCalendarDay(
    monthName: string | undefined,
    dayOfMonth: string | undefined,
): CalendarDay | undefined {
    if (!monthName || !dayOfMonth) {
        return undefined;
    }

    const monthIndex = MONTH_ABBREVIATIONS.indexOf(monthName.toLowerCase());
    if (monthIndex === -1) {
        return undefined;
    }

    return { month: monthIndex + 1, day: Number(dayOfMonth) };
}

function nextOccurrenceOfTime(timeOfDay: TimeOfDay, now: Date, timeZone: string): Date {
    const today = wallClockAt(now, timeZone);
    const resetToday = wallClockToUtc({ ...today, ...timeOfDay }, timeZone);
    if (resetToday > now) {
        return resetToday;
    }

    // Date.UTC rolls an overflowing day into the next month, so day + 1 is always tomorrow.
    return wallClockToUtc({ ...today, ...timeOfDay, day: today.day + 1 }, timeZone);
}

function nextOccurrenceOfDay(
    calendarDay: CalendarDay,
    timeOfDay: TimeOfDay,
    now: Date,
    timeZone: string,
): Date {
    const currentYear = wallClockAt(now, timeZone).year;
    const resetThisYear = wallClockToUtc(
        { year: currentYear, ...calendarDay, ...timeOfDay },
        timeZone,
    );
    if (resetThisYear > now) {
        return resetThisYear;
    }

    return wallClockToUtc({ year: currentYear + 1, ...calendarDay, ...timeOfDay }, timeZone);
}

// Reads the zone's offset at the instant the wall clock would be in UTC, which handles daylight
// saving time without a time zone library.
function wallClockToUtc(wallClock: WallClock, timeZone: string): Date {
    const wallClockAsUtcMs = wallClockToEpochMs(wallClock);
    const shownInZone = wallClockAt(new Date(wallClockAsUtcMs), timeZone);
    const zoneOffsetMs = wallClockToEpochMs(shownInZone) - wallClockAsUtcMs;
    return new Date(wallClockAsUtcMs - zoneOffsetMs);
}

function wallClockToEpochMs(wallClock: WallClock): number {
    return Date.UTC(
        wallClock.year,
        wallClock.month - 1,
        wallClock.day,
        wallClock.hour,
        wallClock.minute,
    );
}

function wallClockAt(instant: Date, timeZone: string): WallClock {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
    }).formatToParts(instant);

    return {
        year: readNumericPart(parts, "year"),
        month: readNumericPart(parts, "month"),
        day: readNumericPart(parts, "day"),
        hour: readNumericPart(parts, "hour"),
        minute: readNumericPart(parts, "minute"),
    };
}

function readNumericPart(
    parts: Intl.DateTimeFormatPart[],
    partType: Intl.DateTimeFormatPartTypes,
): number {
    const part = parts.find((candidate) => candidate.type === partType);
    if (!part) {
        throw new Error(`Intl.DateTimeFormat did not return the ${partType} part`);
    }

    return Number(part.value);
}
