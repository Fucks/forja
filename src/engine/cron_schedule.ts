import { Cron } from "croner";

export type ScheduleValidation = { ok: true } | { ok: false; message: string };

const CRON_FIELD_COUNT = 5;
const CRON_FIELDS_HINT = "5 campos: minuto, hora, dia do mês, mês e dia da semana";
const CRON_MODE = "5-part";
const CRON_FIELD_SEPARATOR = /\s+/;
const PLAIN_NUMBER = /^\d+$/;
const EVERY = "*";
const HOURLY_PREFIX = "a cada hora no minuto";
const DAILY_PREFIXES_BY_DAY_OF_WEEK: Partial<Record<string, string>> = {
    "*": "todo dia",
    "1-5": "dias úteis",
};
// Any expression that fires at all fires again after this date, since five-field crons repeat yearly.
const NEVER_FIRES_PROBE_DATE = new Date(0);

interface CronFields {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
}

export class CronNeverFiresError extends Error {
    override readonly name = "CronNeverFiresError";

    constructor(expression: string) {
        super(`A expressão cron "${expression}" nunca dispara.`);
    }
}

export function validateCron(expression: string): ScheduleValidation {
    if (splitFields(expression).length !== CRON_FIELD_COUNT) {
        return {
            ok: false,
            message: `A expressão cron "${expression}" precisa ter ${CRON_FIELDS_HINT}.`,
        };
    }

    const cron = parseCron(expression);
    if (!cron) {
        return { ok: false, message: `A expressão cron "${expression}" é inválida.` };
    }
    if (!cron.nextRun(NEVER_FIRES_PROBE_DATE)) {
        return { ok: false, message: new CronNeverFiresError(expression).message };
    }

    return { ok: true };
}

export function validateTimezone(timezone: string): ScheduleValidation {
    if (!isKnownTimezone(timezone)) {
        return { ok: false, message: `O fuso horário "${timezone}" é desconhecido.` };
    }

    return { ok: true };
}

/** @throws CronNeverFiresError when the expression has no fire after `after` */
export function nextFireAt(expression: string, timezone: string, after: Date): Date {
    const next = new Cron(expression, { timezone, mode: CRON_MODE }).nextRun(after);
    if (!next) {
        throw new CronNeverFiresError(expression);
    }

    return next;
}

export function describeCron(expression: string): string {
    if (!validateCron(expression).ok) {
        return expression;
    }

    return describeCommonPattern(toCronFields(splitFields(expression))) ?? expression;
}

function splitFields(expression: string): string[] {
    const trimmed = expression.trim();

    return trimmed === "" ? [] : trimmed.split(CRON_FIELD_SEPARATOR);
}

function parseCron(expression: string): Cron | undefined {
    try {
        return new Cron(expression, { mode: CRON_MODE });
    } catch {
        return undefined;
    }
}

function isKnownTimezone(timezone: string): boolean {
    try {
        new Intl.DateTimeFormat(undefined, { timeZone: timezone });
        return true;
    } catch {
        return false;
    }
}

function toCronFields([
    minute = "",
    hour = "",
    dayOfMonth = "",
    month = "",
    dayOfWeek = "",
]: string[]): CronFields {
    return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function describeCommonPattern(fields: CronFields): string | undefined {
    const isEveryDayOfEveryMonth = fields.dayOfMonth === EVERY && fields.month === EVERY;
    if (!isEveryDayOfEveryMonth || !PLAIN_NUMBER.test(fields.minute)) {
        return undefined;
    }

    if (fields.hour === EVERY) {
        return describeHourlyPattern(fields);
    }

    return describeDailyPattern(fields);
}

function describeHourlyPattern(fields: CronFields): string | undefined {
    if (fields.dayOfWeek !== EVERY) {
        return undefined;
    }

    return `${HOURLY_PREFIX} ${Number(fields.minute)}`;
}

function describeDailyPattern(fields: CronFields): string | undefined {
    const prefix = DAILY_PREFIXES_BY_DAY_OF_WEEK[fields.dayOfWeek];
    if (!prefix || !PLAIN_NUMBER.test(fields.hour)) {
        return undefined;
    }

    return `${prefix} às ${formatClockTime(fields.hour, fields.minute)}`;
}

function formatClockTime(hour: string, minute: string): string {
    const padToTwoDigits = (field: string) => String(Number(field)).padStart(2, "0");

    return `${padToTwoDigits(hour)}:${padToTwoDigits(minute)}`;
}
