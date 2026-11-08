const MINUTE_MS = 60_000;
const DEFAULT_FALLBACK_MINUTES = 30;

// A reset time already past means the limit message was stale or misread: waiting the fallback
// is safer than retrying right away into the same limit.
export function computeResumeAt(
    now: Date,
    resetAt: Date | undefined,
    marginMinutes: number,
    fallbackMinutes = DEFAULT_FALLBACK_MINUTES,
): Date {
    if (!resetAt || resetAt.getTime() <= now.getTime()) {
        return addMinutes(now, fallbackMinutes);
    }

    return addMinutes(resetAt, marginMinutes);
}

function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * MINUTE_MS);
}
