// Usage guard for Claude subscription/API limits.
//
// - Reactive: when an agent run fails because a usage limit was hit, every
//   guarded step waits until the limit resets (parsed from the error message)
//   and then retries. Branches are deterministic and the implementer prompt
//   checks progress on its branch, so a retry continues the work.
// - Proactive (optional): token usage is summed from the captured session
//   files; once the estimated budget for the current window is spent, new
//   steps wait for the window to end instead of running into the hard limit.
// - The pause and the window are persisted, so restarting the process keeps
//   respecting them.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type UsageGuardOptions = {
    statePath: string;
    windowHours: number;
    // null disables the proactive budget; only the reactive guard runs.
    tokenBudgetPerWindow: number | null;
    resetMarginMinutes: number;
    maxLimitRetries: number;
    clock?: Clock;
};

export type Clock = {
    now(): Date;
    sleep(milliseconds: number): Promise<void>;
};

const systemClock: Clock = {
    now: () => new Date(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

type RunWithSessions = {
    iterations: { sessionFilePath?: string }[];
};

type GuardState = {
    pausedUntil: string | null;
    windowStartedAt: string | null;
    windowTokens: number;
};

const FALLBACK_WAIT_MINUTES = [5, 15, 30, 60];
const CACHE_READ_WEIGHT = 0.1;
const USAGE_LIMIT_PATTERN =
    /usage limit|session limit|weekly limit|hour limit|limit reached|rate.?limit|429|overloaded|529/i;

export function createUsageGuard(options: UsageGuardOptions) {
    const clock = options.clock ?? systemClock;
    let state = loadState(options.statePath);

    return {
        retryOnUsageLimit,
        recordUsage,
    };

    async function retryOnUsageLimit<T>(stepName: string, step: () => Promise<T>): Promise<T> {
        for (let attempt = 0; ; attempt++) {
            await waitWhilePausedOrOverBudget(stepName);

            try {
                return await step();
            } catch (error) {
                if (!isUsageLimitError(error) || attempt >= options.maxLimitRetries) {
                    throw error;
                }
                pauseUntil(resumeTimeAfterLimit(errorMessage(error), attempt), stepName);
            }
        }
    }

    function recordUsage(run: RunWithSessions): void {
        const tokens = sumWeightedTokens(
            run.iterations.map((iteration) => iteration.sessionFilePath),
        );
        startNewWindowIfExpired();
        state = { ...state, windowTokens: state.windowTokens + tokens };
        saveState(options.statePath, state);
    }

    async function waitWhilePausedOrOverBudget(stepName: string): Promise<void> {
        startNewWindowIfExpired();

        if (isOverBudget()) {
            pauseUntil(windowEnd(), stepName, "estimated token budget for this window was spent");
        }

        // Another parallel step may extend the pause while this one sleeps.
        while (activePause()) {
            await clock.sleep(activePause()!.getTime() - clock.now().getTime());
        }
    }

    function activePause(): Date | null {
        const pausedUntil = state.pausedUntil ? new Date(state.pausedUntil) : null;
        return pausedUntil && pausedUntil > clock.now() ? pausedUntil : null;
    }

    function pauseUntil(resumeAt: Date, stepName: string, reason = "usage limit reached"): void {
        const alreadyPausedLonger = state.pausedUntil && new Date(state.pausedUntil) >= resumeAt;
        if (!alreadyPausedLonger) {
            state = { ...state, pausedUntil: resumeAt.toISOString() };
            saveState(options.statePath, state);
        }

        console.warn(
            `⏸  [${stepName}] ${reason} — ~${Math.round(state.windowTokens)} tokens estimated in this ` +
                `window. Resuming at ${formatLocalTime(new Date(state.pausedUntil!))}.`,
        );
    }

    function resumeTimeAfterLimit(message: string, attempt: number): Date {
        const marginMs = options.resetMarginMinutes * 60_000;
        const resetAt = parseLimitResetTime(message, clock.now());
        if (resetAt) {
            return new Date(resetAt.getTime() + marginMs);
        }

        const fallbackMinutes =
            FALLBACK_WAIT_MINUTES[Math.min(attempt, FALLBACK_WAIT_MINUTES.length - 1)]!;
        return new Date(clock.now().getTime() + fallbackMinutes * 60_000);
    }

    function startNewWindowIfExpired(): void {
        const windowExpired = !state.windowStartedAt || windowEnd() <= clock.now();
        if (windowExpired) {
            state = { ...state, windowStartedAt: clock.now().toISOString(), windowTokens: 0 };
            saveState(options.statePath, state);
        }
    }

    function windowEnd(): Date {
        const startedAt = new Date(state.windowStartedAt ?? clock.now()).getTime();
        return new Date(startedAt + options.windowHours * 3_600_000);
    }

    function isOverBudget(): boolean {
        return (
            options.tokenBudgetPerWindow !== null &&
            state.windowTokens >= options.tokenBudgetPerWindow
        );
    }
}

export function isUsageLimitError(error: unknown): boolean {
    return USAGE_LIMIT_PATTERN.test(errorMessage(error));
}

// Understands the messages Claude Code prints when a limit is hit:
//   "You've hit your session limit · resets 3:40pm (America/Sao_Paulo)"
//   "5-hour limit reached ∙ resets 3pm"
//   "Weekly limit reached · resets Oct 24, 9am (America/Sao_Paulo)"
//   "Claude AI usage limit reached|1761072000"   (unix seconds)
export function parseLimitResetTime(message: string, now: Date): Date | null {
    const epochMatch = message.match(/limit reached\|(\d{10})/i);
    if (epochMatch) {
        return new Date(Number(epochMatch[1]) * 1000);
    }

    const clockMatch = message.match(
        /resets\s+(?:([A-Z][a-z]{2})\s+(\d{1,2}),?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s*\(([^)]+)\))?/i,
    );
    if (!clockMatch) {
        return null;
    }

    const [, monthName, dayOfMonth, hourText, minuteText, meridiem, timeZoneName] = clockMatch;
    const timeZone = timeZoneName ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hour = to24Hour(Number(hourText), meridiem!);
    const minute = Number(minuteText ?? 0);

    if (monthName && dayOfMonth) {
        const month = monthIndex(monthName);
        const year = zonedParts(now, timeZone).year;
        const resetAt = zonedTimeToUtc(
            { year, month, day: Number(dayOfMonth), hour, minute },
            timeZone,
        );
        return resetAt < now
            ? zonedTimeToUtc(
                  { year: year + 1, month, day: Number(dayOfMonth), hour, minute },
                  timeZone,
              )
            : resetAt;
    }

    const today = zonedParts(now, timeZone);
    const resetToday = zonedTimeToUtc({ ...today, hour, minute }, timeZone);
    return resetToday > now ? resetToday : new Date(resetToday.getTime() + 24 * 3_600_000);
}

// Sums the usage of every assistant message in the captured Claude Code
// session files. A message is written to the file once per content block with
// the same id, so usage is counted once per id.
export function sumWeightedTokens(sessionFilePaths: (string | undefined)[]): number {
    let total = 0;
    for (const path of sessionFilePaths) {
        if (!path || !existsSync(path)) continue;
        total += [...usageByMessageId(path).values()].reduce(
            (sum, usage) => sum + weightTokens(usage),
            0,
        );
    }
    return total;
}

type MessageUsage = {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
};

function usageByMessageId(sessionFilePath: string): Map<string, MessageUsage> {
    const usageById = new Map<string, MessageUsage>();
    for (const line of readFileSync(sessionFilePath, "utf8").split("\n")) {
        const entry = parseJsonLine(line);
        const message = entry?.message;
        if (entry?.type === "assistant" && message?.id && message.usage) {
            usageById.set(message.id, message.usage);
        }
    }
    return usageById;
}

function weightTokens(usage: MessageUsage): number {
    return (
        (usage.input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.output_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) * CACHE_READ_WEIGHT
    );
}

function parseJsonLine(
    line: string,
): { type?: string; message?: { id?: string; usage?: MessageUsage } } | null {
    if (!line.trim()) return null;
    try {
        return JSON.parse(line);
    } catch {
        return null;
    }
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

function to24Hour(hour: number, meridiem: string): number {
    const isPm = meridiem.toLowerCase() === "pm";
    if (hour === 12) return isPm ? 12 : 0;
    return isPm ? hour + 12 : hour;
}

function monthIndex(monthName: string): number {
    const MONTHS = [
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
    return MONTHS.indexOf(monthName.toLowerCase()) + 1;
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

function zonedParts(date: Date, timeZone: string): ZonedParts {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
    }).formatToParts(date);
    const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)!.value);
    return {
        year: valueOf("year"),
        month: valueOf("month"),
        day: valueOf("day"),
        hour: valueOf("hour"),
        minute: valueOf("minute"),
    };
}

// Converts a wall-clock time in a time zone to the corresponding instant,
// using the zone's offset at that moment (handles DST without a library).
function zonedTimeToUtc(wallClock: ZonedParts, timeZone: string): Date {
    const asIfUtc = Date.UTC(
        wallClock.year,
        wallClock.month - 1,
        wallClock.day,
        wallClock.hour,
        wallClock.minute,
    );
    const shown = zonedParts(new Date(asIfUtc), timeZone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    return new Date(asIfUtc - (shownAsUtc - asIfUtc));
}

function formatLocalTime(date: Date): string {
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function loadState(statePath: string): GuardState {
    const emptyState: GuardState = { pausedUntil: null, windowStartedAt: null, windowTokens: 0 };
    if (!existsSync(statePath)) return emptyState;
    try {
        return { ...emptyState, ...JSON.parse(readFileSync(statePath, "utf8")) };
    } catch {
        return emptyState;
    }
}

function saveState(statePath: string, state: GuardState): void {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2));
}
