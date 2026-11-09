import { localDayOf } from "@/lib/local_day.js";

describe("localDayOf", () => {
    it("answers the calendar day of the instant in the time zone", () => {
        const lateEveningInSaoPaulo = new Date("2026-11-10T01:30:00Z");

        expect(localDayOf(lateEveningInSaoPaulo, "America/Sao_Paulo")).toBe("2026-11-09");
        expect(localDayOf(lateEveningInSaoPaulo, "UTC")).toBe("2026-11-10");
    });

    it("follows daylight saving time", () => {
        const justAfterMidnightOfSummerInNewYork = new Date("2026-07-01T04:30:00Z");

        expect(localDayOf(justAfterMidnightOfSummerInNewYork, "America/New_York")).toBe(
            "2026-07-01",
        );
    });
});
