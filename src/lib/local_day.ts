// en-CA formats dates as YYYY-MM-DD, the same shape as the ISO dates stored in the database.
const ISO_DAY_LOCALE = "en-CA";
const WALL_CLOCK_LOCALE = "en-US";
const ISO_DAY_LENGTH = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

type TimeZoneFormat = (timeZone: string) => Intl.DateTimeFormat;

const dayFormatOf = cachePerTimeZone(
    (timeZone) =>
        new Intl.DateTimeFormat(ISO_DAY_LOCALE, {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }),
);

const wallClockFormatOf = cachePerTimeZone(
    (timeZone) =>
        new Intl.DateTimeFormat(WALL_CLOCK_LOCALE, {
            timeZone,
            hourCycle: "h23",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
        }),
);

// "YYYY-MM-DD" of the instant on the calendar of the time zone.
export function hostTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function localDayOf(instant: Date, timeZone: string): string {
    return dayFormatOf(timeZone).format(instant);
}

// Reads the zone's offset at the UTC midnight of the day, which handles daylight saving time
// without a time zone library.
export function startOfLocalDay(day: string, timeZone: string): Date {
    const utcMidnightMs = Date.parse(day);
    const zoneOffsetMs = wallClockAsUtcMs(new Date(utcMidnightMs), timeZone) - utcMidnightMs;

    return new Date(utcMidnightMs - zoneOffsetMs);
}

export function addDays(day: string, count: number): string {
    const movedMs = Date.parse(day) + count * MS_PER_DAY;

    return new Date(movedMs).toISOString().slice(0, ISO_DAY_LENGTH);
}

function cachePerTimeZone(createFormat: TimeZoneFormat): TimeZoneFormat {
    const formatsByTimeZone = new Map<string, Intl.DateTimeFormat>();

    return (timeZone) => {
        const cached = formatsByTimeZone.get(timeZone);
        if (cached) {
            return cached;
        }

        const format = createFormat(timeZone);
        formatsByTimeZone.set(timeZone, format);

        return format;
    };
}

function wallClockAsUtcMs(instant: Date, timeZone: string): number {
    const parts = wallClockFormatOf(timeZone).formatToParts(instant);
    const readPart = (partType: Intl.DateTimeFormatPartTypes): number =>
        readNumericPart(parts, partType);

    return Date.UTC(
        readPart("year"),
        readPart("month") - 1,
        readPart("day"),
        readPart("hour"),
        readPart("minute"),
        readPart("second"),
    );
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
