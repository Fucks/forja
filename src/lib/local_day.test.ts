import { addDays, localDayOf, startOfLocalDay } from "@/lib/local_day.js";

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

describe("startOfLocalDay", () => {
    it("answers the instant the day starts in the time zone", () => {
        expect(startOfLocalDay("2026-11-12", "America/Sao_Paulo")).toEqual(
            new Date("2026-11-12T03:00:00.000Z"),
        );
        expect(startOfLocalDay("2026-11-12", "UTC")).toEqual(new Date("2026-11-12T00:00:00.000Z"));
    });

    it("follows daylight saving time", () => {
        expect(startOfLocalDay("2026-07-01", "America/New_York")).toEqual(
            new Date("2026-07-01T04:00:00.000Z"),
        );
        expect(startOfLocalDay("2026-12-01", "America/New_York")).toEqual(
            new Date("2026-12-01T05:00:00.000Z"),
        );
    });

    it("answers the start of a day east of UTC", () => {
        expect(startOfLocalDay("2026-11-12", "Asia/Tokyo")).toEqual(
            new Date("2026-11-11T15:00:00.000Z"),
        );
    });
});

describe("addDays", () => {
    it("moves the day forward and back across months and years", () => {
        expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
        expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
        expect(addDays("2026-11-12", 0)).toBe("2026-11-12");
    });
});
