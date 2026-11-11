const LOCALE = "pt-BR";
const USD_PREFIX = "US$ ";
const ONE_CENT_USD = 0.01;
const DECIMAL_STEPS_PER_UNIT = 10;

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;
const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR;

const TOKEN_SCALES_LARGEST_FIRST = [
    { size: 1_000_000_000, suffix: "bi" },
    { size: 1_000_000, suffix: "mi" },
    { size: 1_000, suffix: "mil" },
];

const upToOneDecimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const twoSignificantDigits = new Intl.NumberFormat(LOCALE, { maximumSignificantDigits: 2 });
const shortDateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: "short", timeStyle: "short" });

export function formatDuration(ms: number): string {
    assertNonNegativeFinite(ms);

    if (ms < MS_PER_MINUTE) {
        return `${upToOneDecimal.format(truncateToOneDecimal(ms, MS_PER_SECOND))} s`;
    }

    if (ms < MS_PER_HOUR) {
        const { minutes, seconds } = splitIntoClockUnits(ms);
        return joinMajorAndMinorUnits(`${minutes} min`, seconds, "s");
    }

    const { hours, minutes } = splitIntoClockUnits(ms);
    return joinMajorAndMinorUnits(`${hours} h`, minutes, "min");
}

export function formatTokens(count: number): string {
    assertNonNegativeFinite(count);

    const scale = TOKEN_SCALES_LARGEST_FIRST.find(({ size }) => count >= size);
    if (!scale) {
        return upToOneDecimal.format(count);
    }

    return `${upToOneDecimal.format(truncateToOneDecimal(count, scale.size))} ${scale.suffix}`;
}

export function formatUsd(amount: number): string {
    assertNonNegativeFinite(amount);

    // Agent calls often cost fractions of a cent; two decimals would show them as free.
    const isBelowOneCent = amount > 0 && amount < ONE_CENT_USD;
    if (isBelowOneCent) {
        return USD_PREFIX + twoSignificantDigits.format(amount);
    }

    return USD_PREFIX + twoDecimals.format(amount);
}

export function formatRelativeOffset(ms: number): string {
    assertNonNegativeFinite(ms);

    const { hours, minutes, seconds } = splitIntoClockUnits(ms);
    if (hours === 0) {
        return `+${padTwoDigits(minutes)}:${padTwoDigits(seconds)}`;
    }

    return `+${hours}:${padTwoDigits(minutes)}:${padTwoDigits(seconds)}`;
}

export function formatDateTime(at: Date): string {
    return shortDateTime.format(at);
}

export function formatCount(count: number, nouns: { one: string; other: string }): string {
    const noun = count === 1 ? nouns.one : nouns.other;

    return `${count} ${noun}`;
}

function assertNonNegativeFinite(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`Expected a non-negative finite number, received ${value}`);
    }
}

// Truncates instead of rounding so a value never shows as the next unit (59_999 ms is "59,9 s").
function truncateToOneDecimal(value: number, unitSize: number): number {
    const decimalSteps = Math.floor((value * DECIMAL_STEPS_PER_UNIT) / unitSize);
    return decimalSteps / DECIMAL_STEPS_PER_UNIT;
}

interface ClockUnits {
    hours: number;
    minutes: number;
    seconds: number;
}

function splitIntoClockUnits(ms: number): ClockUnits {
    return {
        hours: Math.floor(ms / MS_PER_HOUR),
        minutes: Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE),
        seconds: Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND),
    };
}

function joinMajorAndMinorUnits(major: string, minorCount: number, minorUnit: string): string {
    if (minorCount === 0) {
        return major;
    }

    return `${major} ${minorCount} ${minorUnit}`;
}

function padTwoDigits(count: number): string {
    return String(count).padStart(2, "0");
}
