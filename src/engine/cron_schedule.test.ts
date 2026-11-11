import {
    describeCron,
    nextFireAt,
    validateCron,
    validateTimezone,
} from "@/engine/cron_schedule.js";

const SAO_PAULO = "America/Sao_Paulo";
const NEW_YORK = "America/New_York";
const BERLIN = "Europe/Berlin";
const NIGHTLY = "0 22 * * *";

describe("validateCron", () => {
    it.each(["0 22 * * *", "*/15 * * * *", "0 9 * * 1-5", "30 8 1,15 * *"])(
        "accepts the five-field expression %s",
        (expression) => {
            expect(validateCron(expression)).toEqual({ ok: true });
        },
    );

    it.each(["0 22 * *", "0 0 22 * * *", ""])(
        "rejects %j, which does not have five fields",
        (expression) => {
            const result = validateCron(expression);

            expect(result).toEqual({
                ok: false,
                message: expect.stringContaining("5 campos") as unknown,
            });
        },
    );

    it.each(["61 * * * *", "0 25 * * *", "a b c d e"])(
        "rejects %s, which has an invalid field",
        (expression) => {
            const result = validateCron(expression);

            expect(result).toEqual({
                ok: false,
                message: expect.stringContaining(expression) as unknown,
            });
        },
    );

    it("rejects an expression that never fires", () => {
        const result = validateCron("0 0 31 2 *");

        expect(result).toEqual({ ok: false, message: expect.stringContaining("nunca") as unknown });
    });
});

describe("validateTimezone", () => {
    it("accepts an IANA timezone", () => {
        expect(validateTimezone(SAO_PAULO)).toEqual({ ok: true });
    });

    it("rejects an unknown timezone", () => {
        const result = validateTimezone("Marte/Base");

        expect(result).toEqual({
            ok: false,
            message: expect.stringContaining("Marte/Base") as unknown,
        });
    });
});

describe("nextFireAt", () => {
    it("fires at 22:00 of São Paulo, which is 01:00 UTC", () => {
        const next = nextFireAt(NIGHTLY, SAO_PAULO, new Date("2026-11-11T12:00:00Z"));

        expect(next).toEqual(new Date("2026-11-12T01:00:00Z"));
    });

    it("returns the fire after the given instant, never the instant itself", () => {
        const next = nextFireAt(NIGHTLY, SAO_PAULO, new Date("2026-11-12T01:00:00Z"));

        expect(next).toEqual(new Date("2026-11-13T01:00:00Z"));
    });

    it("keeps the local hour when another timezone moves to daylight saving time", () => {
        const beforeChange = nextFireAt("0 9 * * *", NEW_YORK, new Date("2026-03-07T00:00:00Z"));
        const afterChange = nextFireAt("0 9 * * *", NEW_YORK, new Date("2026-03-09T00:00:00Z"));

        expect(beforeChange).toEqual(new Date("2026-03-07T14:00:00Z"));
        expect(afterChange).toEqual(new Date("2026-03-09T13:00:00Z"));
    });

    it("keeps the local hour when another timezone leaves daylight saving time", () => {
        const beforeChange = nextFireAt("0 9 * * *", BERLIN, new Date("2026-10-24T00:00:00Z"));
        const afterChange = nextFireAt("0 9 * * *", BERLIN, new Date("2026-10-26T00:00:00Z"));

        expect(beforeChange).toEqual(new Date("2026-10-24T07:00:00Z"));
        expect(afterChange).toEqual(new Date("2026-10-26T08:00:00Z"));
    });

    it("still fires on the day the clocks skip the scheduled hour", () => {
        const next = nextFireAt("30 2 * * *", NEW_YORK, new Date("2026-03-08T00:00:00Z"));

        expect(next.toISOString().startsWith("2026-03-08")).toBe(true);
    });
});

describe("describeCron", () => {
    it.each([
        ["0 22 * * *", "todo dia às 22:00"],
        ["5 7 * * *", "todo dia às 07:05"],
        ["0 * * * *", "a cada hora no minuto 0"],
        ["15 * * * *", "a cada hora no minuto 15"],
        ["30 8 * * 1-5", "dias úteis às 08:30"],
    ])("describes %s as %j", (expression, description) => {
        expect(describeCron(expression)).toBe(description);
    });

    it.each(["*/15 * * * *", "0 9 1 * *", "0 9 * * 0", "0 25 * * *", "invalida"])(
        "falls back to the expression itself for %s",
        (expression) => {
            expect(describeCron(expression)).toBe(expression);
        },
    );
});
