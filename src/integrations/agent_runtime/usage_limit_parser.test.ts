import { parseUsageLimit } from "@/integrations/agent_runtime/usage_limit_parser.js";
import {
    NON_LIMIT_MESSAGE,
    USAGE_LIMIT_EPOCH_RESET_AT,
    USAGE_LIMIT_MESSAGES,
} from "@/test/fixtures/usage_limit_messages.js";

const MORNING_IN_SAO_PAULO = new Date("2026-11-09T12:00:00Z");
const EVENING_IN_SAO_PAULO = new Date("2026-11-09T22:00:00Z");
const EARLY_OCTOBER = new Date("2026-10-01T12:00:00Z");
const SUMMER_IN_NEW_YORK = new Date("2026-07-01T12:00:00Z");

type ResetCase = {
    behavior: string;
    message: string;
    now: Date;
    defaultTimeZone: string;
    expectedResetAt: string;
};

const RESET_CASES: ResetCase[] = [
    {
        behavior: "resets later today in the time zone named in the message",
        message: USAGE_LIMIT_MESSAGES.sessionLimitWithTimeZone,
        now: MORNING_IN_SAO_PAULO,
        defaultTimeZone: "UTC",
        expectedResetAt: "2026-11-09T18:40:00Z",
    },
    {
        behavior: "resets tomorrow when the time already passed today",
        message: USAGE_LIMIT_MESSAGES.sessionLimitWithTimeZone,
        now: EVENING_IN_SAO_PAULO,
        defaultTimeZone: "UTC",
        expectedResetAt: "2026-11-10T18:40:00Z",
    },
    {
        behavior: "understands an uppercase message",
        message: USAGE_LIMIT_MESSAGES.sessionLimitUppercase,
        now: MORNING_IN_SAO_PAULO,
        defaultTimeZone: "UTC",
        expectedResetAt: "2026-11-09T18:40:00Z",
    },
    {
        behavior: "tolerates extra spaces around the time and the time zone",
        message: USAGE_LIMIT_MESSAGES.sessionLimitWithExtraSpaces,
        now: MORNING_IN_SAO_PAULO,
        defaultTimeZone: "UTC",
        expectedResetAt: "2026-11-09T18:40:00Z",
    },
    {
        behavior: "uses the default time zone when the message names none",
        message: USAGE_LIMIT_MESSAGES.hourLimitWithoutTimeZone,
        now: MORNING_IN_SAO_PAULO,
        defaultTimeZone: "America/New_York",
        expectedResetAt: "2026-11-09T20:00:00Z",
    },
    {
        behavior: "accepts a middle dot instead of a bullet as separator",
        message: USAGE_LIMIT_MESSAGES.hourLimitWithMiddleDot,
        now: MORNING_IN_SAO_PAULO,
        defaultTimeZone: "UTC",
        expectedResetAt: "2026-11-09T15:00:00Z",
    },
    {
        behavior: "reads 12pm as noon",
        message: USAGE_LIMIT_MESSAGES.hourLimitAtNoon,
        now: new Date("2026-11-09T08:00:00Z"),
        defaultTimeZone: "UTC",
        expectedResetAt: "2026-11-09T12:00:00Z",
    },
    {
        behavior: "reads 12am as midnight",
        message: USAGE_LIMIT_MESSAGES.hourLimitAtMidnight,
        now: MORNING_IN_SAO_PAULO,
        defaultTimeZone: "UTC",
        expectedResetAt: "2026-11-10T00:00:00Z",
    },
    {
        behavior: "applies daylight saving time of the named time zone",
        message: USAGE_LIMIT_MESSAGES.hourLimitInNewYork,
        now: SUMMER_IN_NEW_YORK,
        defaultTimeZone: "UTC",
        expectedResetAt: "2026-07-01T19:00:00Z",
    },
    {
        behavior: "resets on the given date of the current year",
        message: USAGE_LIMIT_MESSAGES.weeklyLimitWithDate,
        now: EARLY_OCTOBER,
        defaultTimeZone: "UTC",
        expectedResetAt: "2026-10-24T12:00:00Z",
    },
    {
        behavior: "resets on the given date of the next year when it already passed",
        message: USAGE_LIMIT_MESSAGES.weeklyLimitWithDate,
        now: MORNING_IN_SAO_PAULO,
        defaultTimeZone: "UTC",
        expectedResetAt: "2027-10-24T12:00:00Z",
    },
    {
        behavior: "understands a lowercase date without a comma",
        message: USAGE_LIMIT_MESSAGES.weeklyLimitWithDateWithoutComma,
        now: EARLY_OCTOBER,
        defaultTimeZone: "UTC",
        expectedResetAt: "2026-10-24T12:00:00Z",
    },
    {
        behavior: "falls back to the default time zone when the named one is invalid",
        message: USAGE_LIMIT_MESSAGES.hourLimitWithInvalidTimeZone,
        now: MORNING_IN_SAO_PAULO,
        defaultTimeZone: "America/Sao_Paulo",
        expectedResetAt: "2026-11-09T18:00:00Z",
    },
    {
        behavior: "falls back to UTC when the default time zone is invalid too",
        message: USAGE_LIMIT_MESSAGES.hourLimitWithInvalidTimeZone,
        now: MORNING_IN_SAO_PAULO,
        defaultTimeZone: "Not/A_Zone",
        expectedResetAt: "2026-11-09T15:00:00Z",
    },
];

describe("parseUsageLimit", () => {
    it.each(RESET_CASES)("$behavior", ({ message, now, defaultTimeZone, expectedResetAt }) => {
        const parsed = parseUsageLimit(message, now, defaultTimeZone);

        expect(parsed).toEqual({ isLimit: true, resetAt: new Date(expectedResetAt) });
    });

    it("reads the reset time from unix seconds after the limit message", () => {
        const parsed = parseUsageLimit(
            USAGE_LIMIT_MESSAGES.usageLimitWithEpoch,
            MORNING_IN_SAO_PAULO,
        );

        expect(parsed).toEqual({ isLimit: true, resetAt: USAGE_LIMIT_EPOCH_RESET_AT });
    });

    it.each([
        USAGE_LIMIT_MESSAGES.rateLimited,
        USAGE_LIMIT_MESSAGES.overloaded,
        USAGE_LIMIT_MESSAGES.overloadedWithoutCode,
    ])("recognizes %j as a limit without a reset time", (message) => {
        const parsed = parseUsageLimit(message, MORNING_IN_SAO_PAULO, "UTC");

        expect(parsed).toEqual({ isLimit: true });
    });

    it("does not treat a common error as a limit", () => {
        const parsed = parseUsageLimit(NON_LIMIT_MESSAGE, MORNING_IN_SAO_PAULO, "UTC");

        expect(parsed).toEqual({ isLimit: false });
    });

    it("uses the host time zone when no default time zone is given", () => {
        const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const withoutDefault = parseUsageLimit(
            USAGE_LIMIT_MESSAGES.hourLimitWithoutTimeZone,
            MORNING_IN_SAO_PAULO,
        );
        const withHostDefault = parseUsageLimit(
            USAGE_LIMIT_MESSAGES.hourLimitWithoutTimeZone,
            MORNING_IN_SAO_PAULO,
            hostTimeZone,
        );

        expect(withoutDefault).toEqual(withHostDefault);
    });
});
