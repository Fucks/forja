import { dayRangeEndingOn, dayRangeOfChoice, toUsagePeriod } from "@/web/app/usage/usage_period.js";

describe("dayRangeEndingOn", () => {
    it("answers the last days up to today", () => {
        expect(dayRangeEndingOn("2026-11-12", 7)).toEqual({
            firstDay: "2026-11-06",
            lastDay: "2026-11-12",
        });
    });

    it("answers only today for a single day", () => {
        expect(dayRangeEndingOn("2026-11-12", 1)).toEqual({
            firstDay: "2026-11-12",
            lastDay: "2026-11-12",
        });
    });
});

describe("dayRangeOfChoice", () => {
    const CUSTOM_RANGE = { firstDay: "2026-10-01", lastDay: "2026-10-15" };

    it.each([
        ["today", "2026-11-12"],
        ["7d", "2026-11-06"],
        ["30d", "2026-10-14"],
    ] as const)("answers the days of %s up to today", (choice, firstDay) => {
        const range = dayRangeOfChoice(choice, { today: "2026-11-12", customRange: CUSTOM_RANGE });

        expect(range).toEqual({ firstDay, lastDay: "2026-11-12" });
    });

    it("answers the custom range when the period is custom", () => {
        const range = dayRangeOfChoice("custom", {
            today: "2026-11-12",
            customRange: CUSTOM_RANGE,
        });

        expect(range).toEqual(CUSTOM_RANGE);
    });
});

describe("toUsagePeriod", () => {
    it("starts at the start of the first day and ends at the start of the day after the last", () => {
        const period = toUsagePeriod(
            { firstDay: "2026-11-11", lastDay: "2026-11-12" },
            "America/Sao_Paulo",
        );

        expect(period.from).toBe("2026-11-11T03:00:00.000Z");
        expect(period.to).toBe("2026-11-13T03:00:00.000Z");
    });

    it("lists every day of the range in order", () => {
        const period = toUsagePeriod({ firstDay: "2026-10-30", lastDay: "2026-11-02" }, "UTC");

        expect(period.days).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    });
});
