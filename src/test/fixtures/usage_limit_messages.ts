export const USAGE_LIMIT_MESSAGES = {
    sessionLimitWithTimeZone: "You've hit your session limit · resets 3:40pm (America/Sao_Paulo)",
    sessionLimitUppercase: "YOU'VE HIT YOUR SESSION LIMIT · RESETS 3:40PM (America/Sao_Paulo)",
    sessionLimitWithExtraSpaces:
        "You've hit your session limit  ·  resets   3:40 pm  ( America/Sao_Paulo )",
    hourLimitWithoutTimeZone: "5-hour limit reached ∙ resets 3pm",
    hourLimitWithMiddleDot: "5-hour limit reached · resets 3pm",
    hourLimitAtNoon: "5-hour limit reached ∙ resets 12pm",
    hourLimitAtMidnight: "5-hour limit reached ∙ resets 12am",
    hourLimitInNewYork: "5-hour limit reached ∙ resets 3pm (America/New_York)",
    hourLimitWithInvalidTimeZone: "5-hour limit reached ∙ resets 3pm (Mars/Olympus_Mons)",
    weeklyLimitWithDate: "Weekly limit reached · resets Oct 24, 9am (America/Sao_Paulo)",
    weeklyLimitWithDateWithoutComma: "Weekly limit reached · resets oct 24 9am (America/Sao_Paulo)",
    usageLimitWithEpoch: "Claude AI usage limit reached|1761072000",
    rateLimited: "API Error: 429 Too Many Requests",
    overloaded: 'API Error: 529 {"type":"error","error":{"type":"overloaded_error"}}',
    overloadedWithoutCode: "API is temporarily Overloaded, try again later",
} as const;

export const NON_LIMIT_MESSAGE = "Error: ENOENT: no such file or directory, open 'prompt.md'";

export const USAGE_LIMIT_EPOCH_RESET_AT = new Date("2025-10-21T18:40:00Z");
