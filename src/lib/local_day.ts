// en-CA formats dates as YYYY-MM-DD, the same shape as the ISO dates stored in the database.
const ISO_DAY_LOCALE = "en-CA";

const dayFormatsByTimeZone = new Map<string, Intl.DateTimeFormat>();

// "YYYY-MM-DD" of the instant on the calendar of the time zone.
export function localDayOf(instant: Date, timeZone: string): string {
    return dayFormatOf(timeZone).format(instant);
}

function dayFormatOf(timeZone: string): Intl.DateTimeFormat {
    const cached = dayFormatsByTimeZone.get(timeZone);
    if (cached) {
        return cached;
    }

    const dayFormat = new Intl.DateTimeFormat(ISO_DAY_LOCALE, {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    dayFormatsByTimeZone.set(timeZone, dayFormat);

    return dayFormat;
}
